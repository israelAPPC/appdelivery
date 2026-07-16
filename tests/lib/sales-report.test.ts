import { describe, expect, it } from "vitest";
import { buildSalesReport, filterPaidOrders, parseReportDateParam, type SalesReportOrder } from "@/app/lib/sales-report";

/**
 * Testes da regra pura de agregacao do relatorio financeiro (Task 5.4).
 * Regra critica (CLAUDE.md): so entram na soma pedidos com
 * `payment_status: 'paid'` — nunca `pending`, `pending_offline` ou `failed`.
 */

function makeOrder(overrides: Partial<SalesReportOrder> = {}): SalesReportOrder {
  return {
    total: 50,
    payment_status: "paid",
    payment_method: "on_delivery",
    created_at: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("filterPaidOrders", () => {
  it("mantem apenas pedidos com payment_status 'paid'", () => {
    const orders = [
      makeOrder({ payment_status: "paid" }),
      makeOrder({ payment_status: "pending" }),
      makeOrder({ payment_status: "pending_offline" }),
      makeOrder({ payment_status: "failed" }),
    ];

    const result = filterPaidOrders(orders);
    expect(result).toHaveLength(1);
    expect(result[0].payment_status).toBe("paid");
  });
});

describe("buildSalesReport", () => {
  it("soma apenas pedidos pagos, ignorando pending/pending_offline/failed", () => {
    const orders: SalesReportOrder[] = [
      makeOrder({ total: 100, payment_status: "paid", payment_method: "mp_online" }),
      makeOrder({ total: 50, payment_status: "paid", payment_method: "on_delivery" }),
      makeOrder({ total: 999, payment_status: "pending" }),
      makeOrder({ total: 999, payment_status: "pending_offline" }),
      makeOrder({ total: 999, payment_status: "failed" }),
    ];

    const report = buildSalesReport(orders);
    expect(report.total).toBe(150);
    expect(report.count).toBe(2);
  });

  it("nunca soma pedido on_delivery nao pago mesmo que seja 'pagar na entrega' (regra estrita, sem excecao)", () => {
    const orders: SalesReportOrder[] = [
      makeOrder({ total: 80, payment_status: "pending_offline", payment_method: "on_delivery" }),
    ];

    const report = buildSalesReport(orders);
    expect(report.total).toBe(0);
    expect(report.count).toBe(0);
  });

  it("segmentacao por forma de pagamento sempre bate com o total geral", () => {
    const orders: SalesReportOrder[] = [
      makeOrder({ total: 30, payment_status: "paid", payment_method: "mp_online" }),
      makeOrder({ total: 70, payment_status: "paid", payment_method: "mp_online" }),
      makeOrder({ total: 45.5, payment_status: "paid", payment_method: "on_delivery" }),
      makeOrder({ total: 999, payment_status: "failed", payment_method: "mp_online" }),
    ];

    const report = buildSalesReport(orders);
    const sumOfSegments = report.segments.reduce((sum, segment) => sum + segment.total, 0);

    expect(report.total).toBe(145.5);
    expect(sumOfSegments).toBe(report.total);

    const mpSegment = report.segments.find((s) => s.paymentMethod === "mp_online");
    const deliverySegment = report.segments.find((s) => s.paymentMethod === "on_delivery");
    expect(mpSegment?.total).toBe(100);
    expect(mpSegment?.count).toBe(2);
    expect(deliverySegment?.total).toBe(45.5);
    expect(deliverySegment?.count).toBe(1);
  });

  it("retorna total 0 e segmentos vazios quando nao ha pedidos pagos", () => {
    const report = buildSalesReport([]);
    expect(report.total).toBe(0);
    expect(report.count).toBe(0);
    expect(report.segments.every((s) => s.total === 0 && s.count === 0)).toBe(true);
  });
});

describe("parseReportDateParam", () => {
  it("retorna null quando o parametro nao foi informado", () => {
    expect(parseReportDateParam(null)).toBeNull();
  });

  it("retorna 'invalid' para uma data mal formada (nunca confia em input cru do client)", () => {
    expect(parseReportDateParam("nao-e-uma-data")).toBe("invalid");
  });

  it("retorna um Date valido para uma data ISO valida", () => {
    const result = parseReportDateParam("2026-07-01T00:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
  });
});
