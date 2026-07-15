import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";

/**
 * POST /api/orders/:id/push-subscription
 *
 * Associa uma `PushSubscription` do browser do cliente final ao pedido
 * (Task 4.3). Rota PUBLICA (sem auth): o cliente final do storefront nao
 * tem login no MVP (ver SPEC.md) — o cliente se inscreve para receber
 * updates DAQUELE pedido especifico logo apos finalizar o checkout.
 *
 * Usa exclusivamente o client `service_role` (`createSupabaseAdminClient`),
 * ja que `push_subscriptions` (migration 0012) nao tem policy de INSERT
 * para `anon`/`authenticated` — a validacao de que o `order_id` existe (e
 * pertence a um pedido real) e feita aqui no backend antes de inserir.
 *
 * Erro de validacao de input (payload malformado) ou pedido inexistente
 * retorna sempre 400, nunca 500 (seguranca.md/backend.md).
 */

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractKeys(value: unknown): { p256dh: string; auth: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.p256dh) || !isNonEmptyString(candidate.auth)) return null;
  return { p256dh: candidate.p256dh, auth: candidate.auth };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const orderId = params.id;
  if (!isNonEmptyString(orderId)) {
    return NextResponse.json({ error: "Parametro 'id' e obrigatorio." }, { status: 400 });
  }

  let body: PushSubscriptionBody;
  try {
    body = (await request.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { endpoint } = body;
  if (!isNonEmptyString(endpoint)) {
    return NextResponse.json({ error: "Campo 'endpoint' e obrigatorio." }, { status: 400 });
  }

  const keys = extractKeys(body.keys);
  if (!keys) {
    return NextResponse.json(
      { error: "Campo 'keys' e obrigatorio e deve conter 'p256dh' e 'auth' (formato de PushSubscription.toJSON())." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("[api/orders/:id/push-subscription] Falha ao validar pedido", { orderId, error: orderError });
    return NextResponse.json({ error: "Nao foi possivel validar o pedido." }, { status: 400 });
  }

  if (!order) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 400 });
  }

  const { error: insertError } = await admin
    .from("push_subscriptions")
    .upsert(
      { order_id: orderId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "order_id,endpoint" },
    );

  if (insertError) {
    console.error("[api/orders/:id/push-subscription] Falha ao salvar subscription", { orderId, error: insertError });
    return NextResponse.json({ error: "Nao foi possivel salvar a inscricao de notificacoes." }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
