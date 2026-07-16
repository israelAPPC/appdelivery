/**
 * app/lib/sales-report.ts
 *
 * Logica pura de agregacao do relatorio financeiro (Task 5.4). Nao acessa o
 * banco diretamente — recebe pedidos ja filtrados por `store_id` e aplica a
 * regra de negocio critica (CLAUDE.md):
 *
 *   Uma venda so entra no total do relatorio se `payment_status === 'paid'`.
 *   Pedidos `pending`, `pending_offline` ou `failed` NUNCA entram na soma,
 *   independente da forma de pagamento (`on_delivery` inclusive).
 */

import type { Order, PaymentMethod } from "./orders";

export type SalesReportOrder = Pick<Order, "total" | "payment_status" | "payment_method" | "created_at">;

export type SalesReportSegment = {
  paymentMethod: PaymentMethod;
  total: number;
  count: number;
};

export type SalesReport = {
  total: number;
  count: number;
  segments: SalesReportSegment[];
};

const PAYMENT_METHODS: PaymentMethod[] = ["mp_online", "on_delivery"];

/**
 * Filtra apenas pedidos pagos (`payment_status === 'paid'`) — nunca soma
 * `pending`, `pending_offline` ou `failed` no relatorio de vendas.
 */
export function filterPaidOrders<T extends { payment_status: string }>(orders: T[]): T[] {
  return orders.filter((order) => order.payment_status === "paid");
}

/**
 * Agrega o total vendido (somente pedidos `paid`) e a segmentacao por forma
 * de pagamento (`mp_online` / `on_delivery`). A soma dos segmentos sempre
 * bate com o total geral, pois ambos partem do mesmo subconjunto de pedidos
 * pagos.
 */
export function buildSalesReport(orders: SalesReportOrder[]): SalesReport {
  const paidOrders = filterPaidOrders(orders);

  const segments: SalesReportSegment[] = PAYMENT_METHODS.map((paymentMethod) => {
    const ordersForMethod = paidOrders.filter((order) => order.payment_method === paymentMethod);
    return {
      paymentMethod,
      total: roundCurrency(ordersForMethod.reduce((sum, order) => sum + order.total, 0)),
      count: ordersForMethod.length,
    };
  });

  return {
    total: roundCurrency(paidOrders.reduce((sum, order) => sum + order.total, 0)),
    count: paidOrders.length,
    segments,
  };
}

/** Evita erros de ponto flutuante ao somar valores monetarios (2 casas decimais). */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Valida uma string de data (`from`/`to`, ISO) vinda de query params.
 * Nunca confia em datas cruas do client sem sanitizar (CLAUDE.md): retorna
 * `null` para valores ausentes/invalidos, para que o backend decida (400).
 */
export function parseReportDateParam(value: string | null): Date | null | "invalid" {
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed;
}
