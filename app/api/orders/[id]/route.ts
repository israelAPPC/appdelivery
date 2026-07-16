import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import { nextOrderStatus, type Order, type OrderStatus } from "@/app/lib/orders";
import { sendOrderStatusNotification } from "@/app/lib/notifications";

/**
 * PATCH /api/orders/:id
 *
 * Avanca o status operacional de um pedido (recebido -> preparo -> entrega ->
 * concluido) a partir do painel de pedidos (Task 3.3), e/ou marca um pedido
 * `on_delivery` como pago manualmente (`markAsPaid: true`) quando o lojista
 * recebe o pagamento em maos na entrega/retirada.
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
 *  - `markAsPaid: true` (marcar pagamento na entrega/retirada como recebido):
 *    - So e aceito para pedidos `payment_method === 'on_delivery'`. Pedido
 *      `mp_online` NUNCA pode ser marcado como pago manualmente por esta
 *      rota — retorna 400 — pois isso violaria a regra de seguranca.md de
 *      que so o webhook do Mercado Pago (validado/assinado) pode confirmar
 *      pagamento online (ver app/api/webhooks/mercado-pago/route.ts, nao
 *      alterado por esta rota).
 *    - So tem efeito quando `payment_status` atual e `'pending_offline'`. Se
 *      o pedido ja estiver `'paid'`, e idempotente: retorna 200 sem gerar
 *      novo efeito colateral (nao e erro chamar de novo). Qualquer outro
 *      `payment_status` atual (`'pending'`, `'failed'`) e rejeitado com 400,
 *      pois esses estados so devem ser resolvidos pelo webhook do MP.
 *    - Nunca existe acao de reverter/"despagar" nesta rota.
 *    - Pode vir sozinho ou junto com `status` na mesma requisicao.
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

  const { status, storeId, markAsPaid } = (body ?? {}) as {
    status?: unknown;
    storeId?: unknown;
    markAsPaid?: unknown;
  };

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  const shouldMarkAsPaid = markAsPaid === true;

  // `status` so e validado/aplicado se foi de fato informado no body — isso
  // permite chamar o PATCH so para `markAsPaid`, sem exigir uma transicao de
  // status operacional na mesma requisicao.
  const hasStatusInBody = status !== undefined;
  if (hasStatusInBody && !isValidOrderStatus(status)) {
    return NextResponse.json({ error: "Status de pedido invalido." }, { status: 400 });
  }

  if (!hasStatusInBody && !shouldMarkAsPaid) {
    return NextResponse.json(
      { error: "Informe 'status' e/ou 'markAsPaid' para atualizar o pedido." },
      { status: 400 },
    );
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
    .select("id, status, payment_method, payment_status")
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

  const current = currentOrder as {
    status: OrderStatus;
    payment_method: Order["payment_method"];
    payment_status: Order["payment_status"];
  };

  if (hasStatusInBody) {
    const expectedNextStatus = nextOrderStatus(current.status);
    if (expectedNextStatus !== status) {
      return NextResponse.json(
        { error: "Transicao de status invalida para este pedido." },
        { status: 409 },
      );
    }
  }

  // `markAsPaid`: valida as regras de negocio ANTES de tocar no banco (ver
  // comentario no topo do arquivo). Nunca permite marcar pedido `mp_online`
  // como pago por aqui — so o webhook do Mercado Pago pode.
  let shouldPersistPaid = false;
  if (shouldMarkAsPaid) {
    if (current.payment_method !== "on_delivery") {
      return NextResponse.json(
        {
          error:
            "Pedidos com pagamento online (Mercado Pago) so podem ser marcados como pagos pelo webhook.",
        },
        { status: 400 },
      );
    }

    if (current.payment_status === "paid") {
      // Idempotente: ja esta pago, nao gera novo efeito colateral.
      shouldPersistPaid = false;
    } else if (current.payment_status === "pending_offline") {
      shouldPersistPaid = true;
    } else {
      return NextResponse.json(
        { error: "Este pedido nao pode ser marcado como pago manualmente." },
        { status: 400 },
      );
    }
  }

  const updatePayload: { status?: OrderStatus; payment_status?: "paid" } = {};
  if (hasStatusInBody) updatePayload.status = status;
  if (shouldPersistPaid) updatePayload.payment_status = "paid";

  // Nada a persistir (ex.: markAsPaid idempotente e nenhum status informado):
  // retorna o pedido atual sem chamar UPDATE, evitando efeito colateral
  // desnecessario (ex.: reenviar notificacao de push).
  if (Object.keys(updatePayload).length === 0) {
    const { data: unchangedOrder, error: refetchError } = await authedClient
      .from("orders")
      .select(
        "id, store_id, order_number, customer_name, customer_phone, delivery_address, items, subtotal, shipping_cost, discount, total, payment_method, payment_status, fulfillment_type, status, created_at",
      )
      .eq("id", orderId)
      .eq("store_id", storeId)
      .single();

    if (refetchError || !unchangedOrder) {
      return NextResponse.json({ error: "Nao foi possivel atualizar o pedido." }, { status: 500 });
    }

    return NextResponse.json({ order: unchangedOrder as Order });
  }

  const { data, error } = await authedClient
    .from("orders")
    .update(updatePayload)
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
  if (hasStatusInBody) {
    void sendOrderStatusNotification(orderId, status).catch((error) => {
      console.error("[api/orders/:id] Falha inesperada ao notificar mudanca de status", { orderId, error });
    });
  }

  return NextResponse.json({ order: data as Order });
}
