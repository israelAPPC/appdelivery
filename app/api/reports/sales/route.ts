import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { PaymentMethod } from "@/app/lib/orders";
import { buildSalesReport, type SalesReportOrder } from "@/app/lib/sales-report";

/**
 * GET /api/reports/sales?storeId=<uuid>&from=<iso>&to=<iso>&paymentMethod=<mp_online|on_delivery>
 *
 * Relatorio financeiro basico do lojista (Task 5.4): total vendido no
 * periodo + segmentacao por forma de pagamento.
 *
 * Regras de negocio (CLAUDE.md):
 *  - Exige sessao + permissao `financial` (admin sempre pode), checado no
 *    backend, nunca so no frontend.
 *  - Usa `createAuthedSupabaseClient` (nunca service_role), para que a
 *    consulta continue sujeita a RLS por `store_id` como defesa em
 *    profundidade — nunca mistura dados de mais de uma loja.
 *  - Soma APENAS pedidos com `payment_status = 'paid'` — nunca `pending`,
 *    `pending_offline` ou `failed`, mesmo para `on_delivery` ("pagar na
 *    entrega"): o filtro e aplicado tanto na query (`.eq("payment_status",
 *    "paid")`, defesa em profundidade) quanto na agregacao pura
 *    (`buildSalesReport`, `app/lib/sales-report.ts`, testada antes desta
 *    rota).
 *  - A soma da segmentacao por `payment_method` sempre bate com o total
 *    geral, pois ambos vem da mesma lista de pedidos ja filtrada.
 *  - `from`/`to` sao validados no backend (nunca confia em data crua vinda do
 *    client sem sanitizar): valor invalido -> 400. Sem `from`/`to` -> sem
 *    filtro de periodo (relatorio de todo o historico).
 */

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["mp_online", "on_delivery"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPaymentMethod(value: string): value is PaymentMethod {
  return (VALID_PAYMENT_METHODS as string[]).includes(value);
}

/** `null` = ausente (sem filtro); `"invalid"` = presente mas mal formado (400). */
function parseIsoDateParam(value: string | null): string | null | "invalid" {
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed.toISOString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  const paymentMethodParam = url.searchParams.get("paymentMethod");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  if (paymentMethodParam !== null && !isValidPaymentMethod(paymentMethodParam)) {
    return NextResponse.json(
      { error: "Parametro 'paymentMethod' deve ser 'mp_online' ou 'on_delivery'." },
      { status: 400 },
    );
  }

  const from = parseIsoDateParam(url.searchParams.get("from"));
  if (from === "invalid") {
    return NextResponse.json({ error: "Parametro 'from' invalido (data ISO esperada)." }, { status: 400 });
  }

  const to = parseIsoDateParam(url.searchParams.get("to"));
  if (to === "invalid") {
    return NextResponse.json({ error: "Parametro 'to' invalido (data ISO esperada)." }, { status: 400 });
  }

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.financial) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para ver o relatorio financeiro desta loja." },
      { status: 403 },
    );
  }

  let query = authedClient
    .from("orders")
    .select("total, payment_method, payment_status")
    .eq("store_id", storeId)
    .eq("payment_status", "paid");

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (paymentMethodParam !== null) query = query.eq("payment_method", paymentMethodParam);

  const { data, error } = await query;

  if (error) {
    console.error("[api/reports/sales] Falha ao carregar relatorio de vendas", { storeId, error });
    return NextResponse.json({ error: "Nao foi possivel carregar o relatorio financeiro." }, { status: 500 });
  }

  const orders = (data ?? []).map((order) => ({
    ...order,
    total: typeof order.total === "string" ? Number(order.total) : order.total,
  })) as SalesReportOrder[];

  const report = buildSalesReport(orders);
  const byPaymentMethod = {
    mp_online: report.segments.find((s) => s.paymentMethod === "mp_online")?.total ?? 0,
    on_delivery: report.segments.find((s) => s.paymentMethod === "on_delivery")?.total ?? 0,
  };

  return NextResponse.json({
    total: report.total,
    byPaymentMethod,
    ordersCount: report.count,
  });
}
