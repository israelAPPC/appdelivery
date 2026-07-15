import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";
import { getDecryptedStoreCredential } from "@/app/lib/store-credentials";
import { getPayment } from "@/app/lib/mercado-pago";

/**
 * POST /api/webhooks/mercado-pago?storeId=<storeId>
 *
 * Webhook de confirmacao de pagamento do Mercado Pago (Task 4.1) — sem essa
 * rota, um pedido "pagar agora" (`payment_method: 'mp_online'`) nunca sai
 * sozinho de `payment_status: 'pending'`.
 *
 * Cada loja usa a PROPRIA conta/credencial do Mercado Pago (nao existe
 * integracao marketplace/OAuth compartilhada do app) — por isso o payload
 * recebido do Mercado Pago (`{ type: 'payment', data: { id } }`) nao traz
 * `store_id` nenhum: o `storeId` vem da query string, que foi montada pela
 * propria rota de checkout ao criar a preferencia
 * (`notification_url` = `.../api/webhooks/mercado-pago?storeId=<storeId>`).
 *
 * SEGURANCA (ver seguranca.md e SPEC.md): o corpo do webhook em si NUNCA e
 * confiavel — qualquer terceiro pode forjar um POST para esta URL com
 * qualquer payload. A UNICA fonte de verdade e a API do Mercado Pago: usamos
 * apenas `data.id` do corpo recebido para saber qual pagamento buscar, e
 * buscamos os dados reais do pagamento com o `access_token` PROPRIO da loja
 * (`getDecryptedStoreCredential`). Só quem possui o access_token verdadeiro
 * da loja consegue ler o pagamento na API do Mercado Pago — é isso que
 * valida a autenticidade da notificação. Nenhum outro campo do corpo do
 * webhook (status, external_reference, etc.) é usado diretamente.
 *
 * Idempotencia (teste critico do PLAN.md): reenvio do MESMO payment_id nao
 * deve duplicar nenhum efeito colateral — ver checagem de
 * `order.mp_payment_id` abaixo. O indice unico parcial
 * `orders_mp_payment_id_unique_idx` (migration 0011) e defesa em
 * profundidade contra o mesmo payment_id acabar em pedidos diferentes.
 */

type MercadoPagoNotificationBody = {
  type?: unknown;
  data?: { id?: unknown };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  let body: MercadoPagoNotificationBody;
  try {
    body = (await request.json()) as MercadoPagoNotificationBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  // So nos interessa o tipo de evento "payment" — o Mercado Pago envia
  // outros tipos (ex.: merchant_order) que devem ser reconhecidos sem
  // nenhuma acao, para nao gerar reenvios desnecessarios.
  if (body?.type !== "payment") {
    return NextResponse.json({ ok: true });
  }

  const paymentId = body?.data?.id;
  if (!isNonEmptyString(paymentId) && typeof paymentId !== "number") {
    return NextResponse.json({ error: "Notificacao sem 'data.id' valido." }, { status: 400 });
  }
  const paymentIdString = String(paymentId);

  // Busca a credencial mercado_pago PROPRIA da loja indicada na query string.
  // Se a loja nao tiver credencial configurada (ou o valor nao puder ser
  // lido), nao ha como validar a autenticidade da notificacao — responde com
  // erro (nao 200) para o Mercado Pago tentar reenviar depois, mas sem
  // lancar excecao nao tratada.
  let accessToken: string | null;
  try {
    accessToken = await getDecryptedStoreCredential(storeId, "mercado_pago");
  } catch (error) {
    console.error("[api/webhooks/mercado-pago] Falha ao ler credencial da loja", { storeId, error });
    return NextResponse.json({ error: "Nao foi possivel validar a notificacao." }, { status: 502 });
  }

  if (!accessToken) {
    console.error("[api/webhooks/mercado-pago] Loja sem credencial mercado_pago configurada", { storeId });
    return NextResponse.json({ error: "Loja sem credencial de pagamento configurada." }, { status: 502 });
  }

  let payment;
  try {
    payment = await getPayment(accessToken, paymentIdString);
  } catch (error) {
    console.error("[api/webhooks/mercado-pago] Falha ao buscar pagamento no Mercado Pago", {
      storeId,
      paymentId: paymentIdString,
      error,
    });
    return NextResponse.json({ error: "Nao foi possivel validar o pagamento no Mercado Pago." }, { status: 502 });
  }

  if (!isNonEmptyString(payment.externalReference)) {
    console.error("[api/webhooks/mercado-pago] Pagamento sem external_reference", {
      storeId,
      paymentId: paymentIdString,
    });
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();

  // Sempre filtra por store_id ALEM do id do pedido — nunca deixa o storeId
  // da query string (nao autenticado por sessao) ser usado para atualizar
  // pedido de outra loja (multi-tenant, ver seguranca.md).
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, store_id, payment_status, mp_payment_id")
    .eq("id", payment.externalReference)
    .eq("store_id", storeId)
    .maybeSingle();

  if (orderError) {
    console.error("[api/webhooks/mercado-pago] Falha ao buscar pedido", { storeId, orderError });
    return NextResponse.json({ error: "Nao foi possivel processar a notificacao." }, { status: 502 });
  }

  if (!order) {
    // Nao ha pedido correspondente (ex.: external_reference nao bate com
    // nenhum pedido desta loja) — responde 200 mesmo assim, para o Mercado
    // Pago nao ficar reenviando para sempre um caso que nao vamos resolver,
    // mas loga para investigacao manual.
    console.error("[api/webhooks/mercado-pago] Pedido nao encontrado para external_reference", {
      storeId,
      externalReference: payment.externalReference,
    });
    return NextResponse.json({ ok: true });
  }

  // Idempotencia: reenvio do MESMO payment_id nao deve ter nenhum efeito
  // colateral adicional.
  if (order.mp_payment_id === payment.id) {
    return NextResponse.json({ ok: true });
  }

  if (payment.status === "approved") {
    const { error: updateError } = await admin
      .from("orders")
      .update({ payment_status: "paid", mp_payment_id: payment.id })
      .eq("id", order.id)
      .eq("store_id", storeId);

    if (updateError) {
      console.error("[api/webhooks/mercado-pago] Falha ao marcar pedido como pago", { storeId, orderId: order.id, updateError });
      return NextResponse.json({ error: "Nao foi possivel atualizar o pedido." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  if (payment.status === "rejected" || payment.status === "cancelled") {
    const { error: updateError } = await admin
      .from("orders")
      .update({ payment_status: "failed", mp_payment_id: payment.id })
      .eq("id", order.id)
      .eq("store_id", storeId);

    if (updateError) {
      console.error("[api/webhooks/mercado-pago] Falha ao marcar pedido como falho", { storeId, orderId: order.id, updateError });
      return NextResponse.json({ error: "Nao foi possivel atualizar o pedido." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  // Outros status (pending, in_process, etc.): ainda nao ha decisao final.
  return NextResponse.json({ ok: true });
}
