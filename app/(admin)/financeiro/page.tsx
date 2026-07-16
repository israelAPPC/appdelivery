"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/app/lib/authenticated-fetch";
import { useAdminSession } from "@/app/lib/admin-session-context";

/**
 * app/(admin)/financeiro/page.tsx
 *
 * Relatorio financeiro basico do lojista (Task 5.4): total vendido no
 * periodo + segmentacao por forma de pagamento (`mp_online` / `on_delivery`
 * — os unicos dois valores existentes em `orders.payment_method`, ver
 * supabase/migrations/0009_orders.sql). Consome `/api/reports/sales`, que ja
 * filtra apenas pedidos com `payment_status = 'paid'`.
 *
 * `storeId`/`accessToken` vem do Context compartilhado do painel
 * (`useAdminSession`, ver `app/lib/admin-session-context.tsx`).
 */

type SalesReport = {
  total: number;
  byPaymentMethod: {
    mp_online: number;
    on_delivery: number;
  };
  ordersCount: number;
};

const PAYMENT_METHOD_LABELS: Record<keyof SalesReport["byPaymentMethod"], string> = {
  mp_online: "Mercado Pago (online)",
  on_delivery: "Pagar na entrega/retirada",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroPage() {
  const { storeId, accessToken } = useAdminSession();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "mp_online" | "on_delivery">("");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId || !accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ storeId });
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    if (paymentMethod) params.set("paymentMethod", paymentMethod);

    authenticatedFetch(`/api/reports/sales?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Não foi possível carregar o relatório financeiro.");
        }
        return (await response.json()) as SalesReport;
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, accessToken, from, to, paymentMethod]);

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-semibold text-foreground">Financeiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sessão da loja não encontrada. Faça login novamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Financeiro</h1>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-medium text-foreground sm:text-lg">Filtros</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="financeiro-from" className="block text-sm font-medium text-foreground">
                De
              </label>
              <input
                id="financeiro-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="financeiro-to" className="block text-sm font-medium text-foreground">
                Até
              </label>
              <input
                id="financeiro-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="financeiro-payment-method" className="block text-sm font-medium text-foreground">
                Forma de pagamento
              </label>
              <select
                id="financeiro-payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Todas</option>
                <option value="mp_online">Mercado Pago (online)</option>
                <option value="on_delivery">Pagar na entrega/retirada</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-medium text-foreground sm:text-lg">Resumo do período</h2>

          {loading && <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>}

          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}

          {report && !loading && !error && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total vendido</p>
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(report.total)}</p>
                <p className="text-xs text-muted-foreground">{report.ordersCount} pedido(s) pago(s)</p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">Por forma de pagamento</p>
                <ul className="mt-2 space-y-2">
                  {(Object.keys(report.byPaymentMethod) as (keyof SalesReport["byPaymentMethod"])[]).map(
                    (method) => (
                      <li
                        key={method}
                        className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <span className="text-foreground">{PAYMENT_METHOD_LABELS[method]}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(report.byPaymentMethod[method])}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
