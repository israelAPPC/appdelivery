import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { Order } from "@/app/lib/orders";

/**
 * GET /api/orders?storeId=<uuid>
 *
 * Lista inicial de pedidos para o painel em tempo real (Task 3.3). A
 * atualizacao ao vivo depois do carregamento inicial acontece via
 * subscription do Supabase Realtime feita diretamente pelo client
 * (`app/(admin)/pedidos/page.tsx`), sempre filtrada por `store_id` (nunca
 * cross-tenant) e sujeita a RLS.
 *
 * Regras (CLAUDE.md / regras/seguranca.md):
 *  - Exige sessao + permissao `orders` (admin sempre pode), checado no
 *    backend, nunca so no frontend.
 *  - Usa `createAuthedSupabaseClient` (nunca service_role) para que a
 *    consulta continue sujeita a RLS por `store_id` como defesa em
 *    profundidade.
 *
 * Nota: a tabela `orders` e criada pela Task 3.2 (backend-payments), em
 * paralelo a esta task. O contrato de colunas usado aqui e o definido no
 * PLAN.md para a Task 3.2/3.3.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.orders) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para ver os pedidos desta loja." },
      { status: 403 },
    );
  }

  const { data, error } = await authedClient
    .from("orders")
    .select(
      "id, store_id, order_number, customer_name, customer_phone, delivery_address, items, subtotal, shipping_cost, discount, total, payment_method, payment_status, fulfillment_type, status, created_at",
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/orders] Falha ao listar pedidos", { storeId, error });
    return NextResponse.json({ error: "Nao foi possivel carregar os pedidos." }, { status: 500 });
  }

  return NextResponse.json({ orders: (data ?? []) as Order[] });
}
