import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createProduct } from "@/app/api/products/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as saveCredential } from "@/app/api/store/credentials/route";

/**
 * Testes da rota de checkout (Task 3.2), contra o projeto Supabase real
 * (mesmo padrao de tests/api/products.test.ts).
 *
 * Pre-requisito: migrations supabase/migrations/0004_products.sql e
 * 0009_orders.sql aplicadas no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("POST /api/checkout", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/checkout.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Intercepta as chamadas de rede do OpenRouteService (geocodificacao +
 * matriz de distancia, ver `app/lib/geocode-distance.ts`) para que
 * `getCustomerDistanceKm` resolva de forma deterministica para
 * `distanceKm`, sem depender da rede. `calculateShippingCost` (regra pura)
 * NUNCA e mockada — apenas a fonte da distancia.
 *
 * Outras chamadas de fetch (ex.: client do Supabase, Mercado Pago) seguem
 * para o fetch real/mock ja estubado pelo teste, sem interferencia.
 */
function stubOpenRouteServiceDistance(distanceKm: number, wrappedFetch?: typeof fetch) {
  const originalFetch = wrappedFetch ?? global.fetch;
  return vi.fn((...args: Parameters<typeof fetch>) => {
    const [url] = args;
    const urlString = String(url);

    if (urlString.includes("api.openrouteservice.org/geocode/search")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ features: [{ geometry: { coordinates: [-46.0, -23.0] } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }

    if (urlString.includes("api.openrouteservice.org/v2/matrix/driving-car")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ distances: [[0, distanceKm * 1000]] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }

    return originalFetch(...args);
  });
}

runIfConfigured("POST /api/checkout", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  const storeIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  let storeId: string;
  let adminToken: string;
  let productId: string;
  let productPrice: number;

  beforeAll(async () => {
    const email = `checkout-store-${suffix}@teste-app-delivery.com`;
    const signupResponse = await signup(
      jsonRequest("http://localhost/api/auth/signup", "POST", {
        email,
        password,
        store: { name: `Loja Checkout ${suffix}`, slug: `loja-checkout-${suffix}` },
      }),
    );
    const signupBody = (await signupResponse.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };
    storeId = signupBody.store.id;
    adminToken = signupBody.session.access_token;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(signupBody.user.id);

    // Loja ativa (signup ja cria ativa por padrao) com frete configurado:
    // raio gratis 2km, R$3/km excedente — usado no teste de pedido de entrega.
    // Coordenadas cadastradas da loja: necessarias para `resolveDeliveryShipping`
    // calcular distancia ate o endereco do cliente (geocodificacao mockada nos
    // testes, ver `mockOrsDistance` abaixo).
    await admin
      .from("stores")
      .update({ free_radius_km: 2, price_per_km: 3, address_latitude: -23.55052, address_longitude: -46.633308 })
      .eq("id", storeId);

    const productResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeId}`,
        "POST",
        { name: "Combo Checkout", price: 20 },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );
    const productBody = (await productResponse.json()) as { product: { id: string; price: number } };
    productId = productBody.product.id;
    productPrice = productBody.product.price;
  }, 30000);

  afterAll(async () => {
    for (const id of storeIdsToCleanup) {
      await admin.from("orders").delete().eq("store_id", id);
      await admin.from("coupons").delete().eq("store_id", id);
      await admin.from("store_credentials").delete().eq("store_id", id);
      await admin.from("products").delete().eq("store_id", id);
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pedido 'pagar na entrega' (pickup) e criado com payment_status pending_offline, sem chamar API do Mercado Pago", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn((...args: Parameters<typeof fetch>) => originalFetch(...args));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Retirada",
        customerPhone: "11999990000",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 2 }],
        paymentMethod: "on_delivery",
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { payment_status: string; payment_method: string; total: number; shipping_cost: number };
    };
    expect(body.order.payment_status).toBe("pending_offline");
    expect(body.order.payment_method).toBe("on_delivery");
    expect(body.order.shipping_cost).toBe(0);
    expect(body.order.total).toBe(productPrice * 2);

    // Nunca chama a API do Mercado Pago no fluxo "pagar na entrega/retirada"
    // (outras chamadas de fetch, ex.: do proprio client do Supabase, sao
    // esperadas e nao contam para esta asserção).
    const mercadoPagoCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("api.mercadopago.com"),
    );
    expect(mercadoPagoCalls).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });

  it("pedido de entrega fora do raio gratis recalcula subtotal+frete no backend, ignorando total enviado pelo client", async () => {
    // Geocodificacao/distancia do OpenRouteService mockadas para resolver de
    // forma deterministica a 5km (2km gratis + 3km excedente x R$3/km = R$9
    // de frete, via `calculateShippingCost` real — nao mockada).
    const fetchSpy = stubOpenRouteServiceDistance(5);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Entrega",
        customerPhone: "11999990001",
        fulfillmentType: "delivery",
        deliveryAddress: { street: "Rua Teste", number: "123" },
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        total: 999999, // valor arbitrario enviado pelo client — deve ser ignorado
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { subtotal: number; shipping_cost: number; total: number };
    };
    expect(body.order.subtotal).toBe(productPrice);
    expect(body.order.shipping_cost).toBe(9);
    expect(body.order.total).toBe(productPrice + 9);
  }, { retry: 3, timeout: 30000 });

  it("pedido de entrega dentro do raio gratis nao cobra frete", async () => {
    // 1.5km, dentro do raio gratis de 2km configurado para a loja -> frete 0.
    const fetchSpy = stubOpenRouteServiceDistance(1.5);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Entrega Perto",
        customerPhone: "11999990005",
        fulfillmentType: "delivery",
        deliveryAddress: { street: "Rua Teste", number: "456" },
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { subtotal: number; shipping_cost: number; total: number };
    };
    expect(body.order.subtotal).toBe(productPrice);
    expect(body.order.shipping_cost).toBe(0);
    expect(body.order.total).toBe(productPrice);
  }, { retry: 3, timeout: 30000 });

  it("pedido 'pagar agora' (mp_online) sem credencial mercado_pago configurada e rejeitado com 400", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Online",
        customerPhone: "11999990002",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "mp_online",
      }),
    );
    expect(response.status).toBe(400);
  }, { retry: 3, timeout: 30000 });

  it("pedido 'pagar agora' gera link de preferencia usando a credencial propria da loja, com total correto", async () => {
    await saveCredential(
      jsonRequest("http://localhost/api/store/credentials", "POST", {
        storeId,
        provider: "mercado_pago",
        value: "TEST-access-token-da-loja",
      }, { Authorization: `Bearer ${adminToken}` }),
    );

    const originalFetch = global.fetch;
    const fetchSpy = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [url, init] = args;
      if (!String(url).includes("api.mercadopago.com")) {
        // Chamadas que nao sao para o Mercado Pago (ex.: client do Supabase)
        // seguem para o fetch real, sem interferencia deste mock.
        return originalFetch(...args);
      }

      expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer TEST-access-token-da-loja");
      const requestBody = JSON.parse(init!.body as string) as { items: Array<{ unit_price: number }> };
      expect(requestBody.items[0].unit_price).toBe(productPrice);

      return new Response(
        JSON.stringify({ id: "pref-123", init_point: "https://mercadopago.com/checkout/pref-123" }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Online",
        customerPhone: "11999990003",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 3 }],
        paymentMethod: "mp_online",
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { payment_status: string; total: number };
      paymentUrl: string;
    };
    expect(body.order.payment_status).toBe("pending");
    expect(body.order.total).toBe(productPrice * 3);
    expect(body.paymentUrl).toBe("https://mercadopago.com/checkout/pref-123");
    const mercadoPagoCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("api.mercadopago.com"));
    expect(mercadoPagoCalls).toHaveLength(1);
  }, { retry: 3, timeout: 30000 });

  it("produto inexistente/de outra loja e rejeitado com 400 (nunca aceita preco arbitrario do client)", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Invalido",
        customerPhone: "11999990004",
        fulfillmentType: "pickup",
        items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
        paymentMethod: "on_delivery",
      }),
    );
    expect(response.status).toBe(400);
  }, { retry: 3, timeout: 30000 });

  it("pedido de entrega com deliveryAddress ausente e rejeitado com 400, sem criar pedido", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Sem Endereco",
        customerPhone: "11999990006",
        fulfillmentType: "delivery",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { data } = await admin.from("orders").select("id").eq("customer_phone", "11999990006");
    expect(data).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });

  it("pedido de entrega com deliveryAddress sem 'number' e rejeitado com 400, sem criar pedido", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Sem Numero",
        customerPhone: "11999990007",
        fulfillmentType: "delivery",
        deliveryAddress: { street: "Rua X" },
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { data } = await admin.from("orders").select("id").eq("customer_phone", "11999990007");
    expect(data).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });

  it("pedido de entrega com deliveryAddress de campos vazios ('street'/'number' em branco) e rejeitado com 400, sem criar pedido", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Campos Vazios",
        customerPhone: "11999990008",
        fulfillmentType: "delivery",
        deliveryAddress: { street: "", number: "" },
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { data } = await admin.from("orders").select("id").eq("customer_phone", "11999990008");
    expect(data).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });

  // ---------------------------------------------------------------------
  // Cupons (Task 5.2)
  // ---------------------------------------------------------------------

  it("cupom expirado e rejeitado no checkout com 400, sem criar pedido", async () => {
    const code = `EXPIRADO${suffix}`;
    await admin.from("coupons").insert({
      store_id: storeId,
      code,
      discount_type: "fixed",
      discount_value: 5,
      active: true,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Cupom Expirado",
        customerPhone: "11999990009",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        couponCode: code,
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { data } = await admin.from("orders").select("id").eq("customer_phone", "11999990009");
    expect(data).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });

  it("cupom de frete gratis zera o valor do frete sem alterar o subtotal dos produtos", async () => {
    const code = `FRETEGRATIS${suffix}`;
    await admin.from("coupons").insert({
      store_id: storeId,
      code,
      discount_type: "free_shipping",
      discount_value: null,
      active: true,
      expires_at: null,
    });

    // 5km fora do raio gratis (2km) x R$3/km = R$9 de frete, que o cupom
    // deve zerar sem alterar o subtotal dos produtos.
    const fetchSpy = stubOpenRouteServiceDistance(5);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Frete Gratis",
        customerPhone: "11999990010",
        fulfillmentType: "delivery",
        deliveryAddress: { street: "Rua Teste", number: "789" },
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        couponCode: code,
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { subtotal: number; shipping_cost: number; discount: number; total: number };
    };
    expect(body.order.subtotal).toBe(productPrice);
    expect(body.order.shipping_cost).toBe(0);
    expect(body.order.total).toBe(productPrice);
  }, { retry: 3, timeout: 30000 });

  it("cupom percentual aplica desconto sobre o subtotal", async () => {
    const code = `PERCENT10-${suffix}`;
    await admin.from("coupons").insert({
      store_id: storeId,
      code,
      discount_type: "percentage",
      discount_value: 10,
      active: true,
      expires_at: null,
    });

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Cupom Percentual",
        customerPhone: "11999990011",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        couponCode: code.toLowerCase(),
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { subtotal: number; discount: number; total: number };
    };
    expect(body.order.subtotal).toBe(productPrice);
    expect(body.order.discount).toBe(Math.round(productPrice * 0.1 * 100) / 100);
    expect(body.order.total).toBe(Math.round((productPrice - productPrice * 0.1) * 100) / 100);
  }, { retry: 3, timeout: 30000 });

  it("cupom com desconto fixo maior que o total nunca deixa o total negativo", async () => {
    const code = `FIXOALTO-${suffix}`;
    await admin.from("coupons").insert({
      store_id: storeId,
      code,
      discount_type: "fixed",
      discount_value: 999,
      active: true,
      expires_at: null,
    });

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Cupom Fixo Alto",
        customerPhone: "11999990012",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        couponCode: code,
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { order: { total: number } };
    expect(body.order.total).toBe(0);
  }, { retry: 3, timeout: 30000 });

  it("cupom inexistente/inativo e rejeitado com 400, sem criar pedido", async () => {
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Cupom Invalido",
        customerPhone: "11999990013",
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "on_delivery",
        couponCode: "NAO-EXISTE-123",
      }),
    );

    expect(response.status).toBe(400);
    const { data } = await admin.from("orders").select("id").eq("customer_phone", "11999990013");
    expect(data).toHaveLength(0);
  }, { retry: 3, timeout: 30000 });
});
