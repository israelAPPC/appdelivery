import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import { nextOrderStatus, type Order, type OrderStatus } from "@/app/lib/orders";
import { sendOrderStatusNotification } from "@/app/lib/notifications";

/**
 * PATCH /api/orders/:id
 *
 * Avanca o status operacional de um pedido (recebido -> preparo -> entrega ->
 * concluido) a partir do painel de pedidos (Task 3.3).
 *
 * Regras (CLAUDE.md / regras/seguranca.md / convencoes-gerais.md):
 *  - Exige sessao (401) e permissao `orders` (admin sempre pode) checada no
 *    backend (403) — defesa em profundidade, alem da RLS/policy da migration
 *    0010 (`orders_update_own_store_with_permission`).
 *  - Usa `createAuthedSupabaseClient` (nunca service_role): a RLS continua
 *    sendo a fonte de verdade final.
 *  - O UPDATE e sempre filtrado por `id` E `store_id` (multi-tenant explicito
 *    — nunca permite atualizar pedido de outra loja).
 *  - Erro de validacao de input retorna 400, nunca 500.
 *  - A sequencia do fluxo (recebido -> preparo -> entrega -> concluido) e
 *    validada NO BACKEND (nunca so no client): o novo status so e aceito se
 *    for exatamente `nextOrderStatus(statusAtual)` (reusa a mesma funcao
 *    pura usada pela UI, sem duplicar a regra). Pular etapa, retroceder ou
 *    tentar avancar um pedido ja `concluido` retorna 409 Conflict.
 */

const VALID_ORDER_STATUSES: OrderStatus[] = ["recebido", "preparo", "entrega", "concluido"];

function isValidOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (VALID_ORDER_STATUSES as string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const orderId = params.id;
  if (!isNonEmptyString(orderId)) {
    return NextResponse.json({ error: "Parametro 'id' e obrigatorio." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const { status, storeId } = (body ?? {}) as { status?: unknown; storeId?: unknown };

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  if (!isValidOrderStatus(status)) {
    return NextResponse.json({ error: "Status de pedido invalido." }, { status: 400 });
  }

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.orders) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para alterar pedidos desta loja." },
      { status: 403 },
    );
  }

  const { data: currentOrder, error: fetchError } = await authedClient
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("store_id", storeId)
    .single();

  if (fetchError) {
    console.error("[api/orders/:id] Falha ao buscar status atual do pedido", {
      orderId,
      storeId,
      error: fetchError,
    });
    return NextResponse.json({ error: "Nao foi possivel atualizar o pedido." }, { status: 500 });
  }

  if (!currentOrder) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  const expectedNextStatus = nextOrderStatus((currentOrder as { status: OrderStatus }).status);
  if (expectedNextStatus !== status) {
    return NextResponse.json(
      { error: "Transicao de status invalida para este pedido." },
      { status: 409 },
    );
  }

  const { data, error } = await authedClient
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("store_id", storeId)
    .select(
      "id, store_id, order_number, customer_name, customer_phone, delivery_address, items, subtotal, shipping_cost, discount, total, payment_method, payment_status, fulfillment_type, status, created_at",
    )
    .single();

  if (error) {
    console.error("[api/orders/:id] Falha ao atualizar status do pedido", { orderId, storeId, error });
    return NextResponse.json({ error: "Nao foi possivel atualizar o pedido." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  // Dispara a notificacao de push (Task 4.3) APENAS depois do status ja ter
  // sido persistido com sucesso acima. Fire-and-forget: uma falha aqui
  // (subscription expirada, provedor de push indisponivel, etc.) nunca pode
  // derrubar a resposta de sucesso do PATCH — `sendOrderStatusNotification`
  // ja captura suas proprias excecoes, mas o `catch` abaixo e uma defesa em
  // profundidade extra.
  void sendOrderStatusNotification(orderId, status).catch((error) => {
    console.error("[api/orders/:id] Falha inesperada ao notificar mudanca de status", { orderId, error });
  });

  return NextResponse.json({ order: data as Order });
}
