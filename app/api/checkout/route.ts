import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";
import { type FulfillmentType } from "@/app/lib/calculate-shipping";
import { calculateOrderTotal } from "@/app/lib/calculate-order-total";
import { resolveDeliveryShipping } from "@/app/lib/delivery-shipping";
import { getDecryptedStoreCredential, hasProviderConfigured } from "@/app/lib/store-credentials";
import { createPaymentPreference } from "@/app/lib/mercado-pago";
import { formatDeliveryAddressForGeocoding, isValidDeliveryAddressInput } from "@/app/lib/orders";
import type { TablesInsert } from "@/app/lib/database.types";

/**
 * POST /api/checkout
 *
 * Cria um pedido do storefront (Task 3.2). Nao exige autenticacao — o
 * cliente final do delivery nao tem login no MVP (ver SPEC.md) — por isso
 * esta rota usa exclusivamente o client `service_role`
 * (`createSupabaseAdminClient`) para inserir em `orders`, ja que a tabela
 * nao tem policy de INSERT para `anon`/`authenticated` (ver migration
 * 0009_orders.sql). Todo o valor e recalculado aqui no backend — o total
 * enviado pelo client (se houver) e sempre ignorado.
 *
 * payment_method:
 *  - "on_delivery" (pagar na entrega/retirada): cria o pedido com
 *    `payment_status: "pending_offline"`, sem nenhuma chamada a API do
 *    Mercado Pago.
 *  - "mp_online" (pagar agora): exige que a loja tenha a credencial
 *    `mercado_pago` configurada (`hasProviderConfigured`); gera uma
 *    preferencia de Checkout Pro usando o `access_token` proprio da loja
 *    (nunca uma chave global do app) e cria o pedido com
 *    `payment_status: "pending"`.
 *
 * Esta rota NUNCA marca um pedido como "paid"/"failed" — isso e
 * responsabilidade exclusiva do webhook do Mercado Pago (Fase 4), apos
 * validar a assinatura.
 */

type CheckoutItemInput = {
  productId?: unknown;
  quantity?: unknown;
};

type CheckoutBody = {
  storeId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  fulfillmentType?: unknown;
  deliveryAddress?: unknown;
  items?: unknown;
  paymentMethod?: unknown;
  couponCode?: unknown;
};

/**
 * Resolve a URL base publica do app para montar o `notification_url` da
 * preferencia de pagamento (Task 4.1 — webhook do Mercado Pago).
 *
 * Preferencia: `NEXT_PUBLIC_APP_URL`, se configurada (mais robusto — sempre
 * a URL canonica de producao, independente de headers de proxy). Se nao
 * estiver configurada (ex.: dev local sem essa env var), deriva do proprio
 * request de checkout — funciona tanto em dev quanto na Vercel, que envia
 * `host`/`x-forwarded-proto` corretos por padrao.
 */
function resolveAppBaseUrl(request: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (isNonEmptyString(configuredUrl)) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFulfillmentType(value: unknown): value is FulfillmentType {
  return value === "delivery" || value === "pickup";
}

function isPaymentMethod(value: unknown): value is "mp_online" | "on_delivery" {
  return value === "mp_online" || value === "on_delivery";
}

function isValidItemsInput(value: unknown): value is Array<{ productId: string; quantity: number }> {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item: CheckoutItemInput) => {
    return (
      isNonEmptyString(item?.productId) &&
      isFiniteNumber(item?.quantity) &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
    );
  });
}

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  // `distanceKm` NUNCA e lido do body: se o client enviar, e ignorado por
  // completo (seguranca.md — frete sempre recalculado no backend a partir
  // do endereco real, nunca confiando em valor enviado pelo client).
  const { storeId, customerName, customerPhone, fulfillmentType, deliveryAddress, items, paymentMethod } = body;

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }
  if (!isNonEmptyString(customerName)) {
    return NextResponse.json({ error: "Campo 'customerName' e obrigatorio." }, { status: 400 });
  }
  if (!isNonEmptyString(customerPhone)) {
    return NextResponse.json({ error: "Campo 'customerPhone' e obrigatorio." }, { status: 400 });
  }
  if (!isFulfillmentType(fulfillmentType)) {
    return NextResponse.json(
      { error: "Campo 'fulfillmentType' deve ser 'delivery' ou 'pickup'." },
      { status: 400 },
    );
  }
  if (fulfillmentType === "delivery" && !isValidDeliveryAddressInput(deliveryAddress)) {
    return NextResponse.json(
      {
        error:
          "Campo 'deliveryAddress' e obrigatorio para pedidos de entrega e deve conter ao menos 'street' e 'number' (nao vazios).",
      },
      { status: 400 },
    );
  }
  const validatedDeliveryAddress =
    fulfillmentType === "delivery" && isValidDeliveryAddressInput(deliveryAddress)
      ? deliveryAddress
      : undefined;
  if (!isValidItemsInput(items)) {
    return NextResponse.json(
      { error: "Campo 'items' e obrigatorio: lista de { productId, quantity > 0 }." },
      { status: 400 },
    );
  }
  if (!isPaymentMethod(paymentMethod)) {
    return NextResponse.json(
      { error: "Campo 'paymentMethod' deve ser 'mp_online' ou 'on_delivery'." },
      { status: 400 },
    );
  }

  // Cupom (Task 5.2): opcional. Nunca confia em nenhum valor de desconto
  // vindo pronto do client — o cupom e sempre buscado no banco pelo codigo,
  // e o desconto e sempre recalculado aqui a partir do cupom real (mesma
  // regra de seguranca ja aplicada a preco/frete nesta rota).
  const couponCode = isNonEmptyString(body.couponCode) ? body.couponCode.trim() : null;

  const admin = createSupabaseAdminClient();

  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id, is_active, free_radius_km, price_per_km, address_latitude, address_longitude")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError || !store || !store.is_active) {
    return NextResponse.json({ error: "Loja nao encontrada ou inativa." }, { status: 400 });
  }

  // Recalcula o subtotal a partir dos precos ATUAIS no banco — nunca confia
  // em preco enviado pelo client (seguranca.md).
  const productIds = [...new Set(items.map((item) => item.productId))];
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, name, price, available")
    .eq("store_id", storeId)
    .in("id", productIds);

  if (productsError) {
    console.error("[api/checkout] Falha ao buscar produtos", { storeId, error: productsError });
    return NextResponse.json({ error: "Erro interno ao validar os itens do pedido." }, { status: 500 });
  }

  const productById = new Map((products ?? []).map((product) => [product.id, product]));

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || !product.available) {
      return NextResponse.json(
        { error: `Produto '${item.productId}' invalido ou indisponivel.` },
        { status: 400 },
      );
    }
  }

  const orderItems = items.map((item) => {
    const product = productById.get(item.productId)!;
    const unitPrice = Number(product.price);
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      subtotal: Math.round(unitPrice * item.quantity * 100) / 100,
    };
  });

  const subtotal = Math.round(orderItems.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;

  // Frete e sempre recalculado no backend a partir da distancia real
  // (nunca de um `distanceKm` enviado pelo client): para `delivery`,
  // geocodifica o endereco estruturado do cliente e calcula a distancia ate
  // as coordenadas cadastradas da loja (mesmo helper de /api/shipping/estimate).
  const shippingResult = await resolveDeliveryShipping({
    fulfillmentType,
    address:
      fulfillmentType === "delivery" && validatedDeliveryAddress !== undefined
        ? formatDeliveryAddressForGeocoding(validatedDeliveryAddress)
        : undefined,
    storeCoordinates:
      store.address_latitude !== null && store.address_longitude !== null
        ? { latitude: store.address_latitude, longitude: store.address_longitude }
        : null,
    freeRadiusKm: store.free_radius_km,
    pricePerKm: store.price_per_km,
  });

  if (shippingResult.shippingCost === null) {
    return NextResponse.json({ error: shippingResult.error }, { status: 400 });
  }

  let shippingCost = shippingResult.shippingCost;

  // Cupom (Task 5.2): buscado por (store_id, lower(code)) — nunca confia em
  // discount_type/discount_value vindo do client, so no codigo digitado.
  // Cupom de frete gratis so zera o `shippingCost` ja calculado acima (a
  // logica de distancia/raio continua rodando normalmente, ver
  // .claude/skills/calculo-frete/SKILL.md) — nunca altera o subtotal.
  let discount = 0;
  if (couponCode !== null) {
    // `ilike` faz comparacao case-insensitive; escapa `%`/`_` do codigo
    // digitado para que nao sejam interpretados como wildcards do padrao.
    const escapedCouponCode = couponCode.replace(/[%_]/g, (match) => `\\${match}`);
    const { data: coupon, error: couponError } = await admin
      .from("coupons")
      .select("discount_type, discount_value, active, expires_at")
      .eq("store_id", storeId)
      .ilike("code", escapedCouponCode)
      .maybeSingle();

    if (couponError) {
      console.error("[api/checkout] Falha ao buscar cupom", { storeId, couponCode, error: couponError });
      return NextResponse.json({ error: "Erro interno ao validar o cupom." }, { status: 500 });
    }

    if (!coupon || !coupon.active) {
      return NextResponse.json({ error: "Cupom invalido ou inexistente." }, { status: 400 });
    }

    if (coupon.expires_at !== null && new Date(coupon.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Cupom expirado." }, { status: 400 });
    }

    if (coupon.discount_type === "percentage") {
      discount = Math.round(subtotal * ((coupon.discount_value ?? 0) / 100) * 100) / 100;
    } else if (coupon.discount_type === "fixed") {
      discount = coupon.discount_value ?? 0;
    } else if (coupon.discount_type === "free_shipping") {
      shippingCost = 0;
    }
  }

  // Nunca deixa o desconto exceder subtotal + frete (evita total negativo e
  // mantem o valor de `discount` persistido consistente com o total real).
  discount = Math.min(discount, Math.round((subtotal + shippingCost) * 100) / 100);

  const total = calculateOrderTotal({ subtotal, shippingCost, discount });

  const paymentStatus = paymentMethod === "on_delivery" ? "pending_offline" : "pending";

  // Loja sem mercado_pago configurado nunca pode ter pagamento "pagar
  // agora" habilitado (mesma regra da Task 2.4/hasProviderConfigured).
  if (paymentMethod === "mp_online" && !(await hasProviderConfigured(storeId, "mercado_pago"))) {
    return NextResponse.json(
      { error: "Esta loja nao tem pagamento online configurado. Escolha 'pagar na entrega/retirada'." },
      { status: 400 },
    );
  }

  const insertPayload: TablesInsert<"orders"> = {
    store_id: storeId,
    customer_name: customerName.trim(),
    customer_phone: customerPhone.trim(),
    delivery_address: fulfillmentType === "delivery" ? (validatedDeliveryAddress ?? null) : null,
    items: orderItems,
    subtotal,
    shipping_cost: shippingCost,
    discount,
    total,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    fulfillment_type: fulfillmentType,
  };

  const { data: order, error: orderError } = await admin.from("orders").insert(insertPayload).select().single();

  if (orderError || !order) {
    console.error("[api/checkout] Falha ao criar pedido", { storeId, error: orderError });
    return NextResponse.json({ error: "Nao foi possivel criar o pedido." }, { status: 500 });
  }

  if (paymentMethod === "on_delivery") {
    // Fluxo "pagar na entrega/retirada": nunca chama a API do Mercado Pago.
    return NextResponse.json({ order }, { status: 201 });
  }

  // paymentMethod === "mp_online": gera a preferencia usando a credencial
  // PROPRIA da loja (nunca uma chave global do app).
  const accessToken = await getDecryptedStoreCredential(storeId, "mercado_pago");
  if (!accessToken) {
    // Defesa em profundidade: hasProviderConfigured ja checou acima, mas se
    // por qualquer motivo o valor nao puder ser lido agora, nunca prossegue
    // com uma chave vazia/global.
    console.error("[api/checkout] mercado_pago configurado mas credencial nao pode ser lida", { storeId });
    return NextResponse.json(
      { error: "Nao foi possivel gerar o pagamento online desta loja. Tente novamente." },
      { status: 502 },
    );
  }

  try {
    const preference = await createPaymentPreference({
      accessToken,
      externalReference: order.id,
      items: orderItems.map((item) => ({ title: item.name, quantity: item.quantity, unitPrice: item.unitPrice })),
      notificationUrl: `${resolveAppBaseUrl(request)}/api/webhooks/mercado-pago?storeId=${storeId}`,
    });

    return NextResponse.json({ order, paymentUrl: preference.initPoint }, { status: 201 });
  } catch (error) {
    console.error("[api/checkout] Falha ao criar preferencia no Mercado Pago", { storeId, orderId: order.id, error });
    return NextResponse.json(
      { error: "Pedido criado, mas nao foi possivel gerar o link de pagamento. Tente novamente." },
      { status: 502 },
    );
  }
}
