import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de `/api/reports/sales` (Task 5.4 — relatorio financeiro basico).
 *
 * `getSession`/`getStorePermissions`/`createAuthedSupabaseClient` sao
 * mockados aqui (mesmo padrao de tests/api/orders.test.ts) — a rota so
 * precisa ser exercitada unitariamente, sem depender de banco real.
 *
 * Testes criticos (CLAUDE.md):
 *  - soma APENAS pedidos com payment_status = 'paid' (nunca pending,
 *    pending_offline ou failed);
 *  - a soma da segmentacao por payment_method bate com o total geral.
 */

const mockGetSession = vi.fn();
const mockGetStorePermissions = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/app/lib/auth", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getStorePermissions: (...args: unknown[]) => mockGetStorePermissions(...args),
  createAuthedSupabaseClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/reports/sales/route";

const STORE_ID = "33333333-3333-3333-3333-333333333333";

function makeOrdersQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function authedRequest(query: string) {
  return new Request(`http://localhost/api/reports/sales?${query}`, {
    headers: { Authorization: "Bearer token-abc" },
  });
}

describe("GET /api/reports/sales", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetStorePermissions.mockReset();
    mockFrom.mockReset();
  });

  it("400 quando 'storeId' nao e informado", async () => {
    const response = await GET(new Request("http://localhost/api/reports/sales"));
    expect(response.status).toBe(400);
  });

  it("401 quando nao ha sessao autenticada", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await GET(authedRequest(`storeId=${STORE_ID}`));
    expect(response.status).toBe(401);
  });

  it("403 quando o usuario nao tem permissao 'financial' desta loja", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "employee",
      permissions: { orders: true, catalog: true, financial: false, settings: false },
    });

    const response = await GET(authedRequest(`storeId=${STORE_ID}`));

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("admin sempre tem acesso, mesmo sem 'financial' salvo explicitamente", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockFrom.mockReturnValue(makeOrdersQueryBuilder({ data: [], error: null }));

    const response = await GET(authedRequest(`storeId=${STORE_ID}`));

    expect(response.status).toBe(200);
  });

  it("soma apenas pedidos com payment_status='paid' (ignora pending, pending_offline, failed)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    // O client real filtra `payment_status = 'paid'` na query (.eq); o
    // builder mockado simula a resposta ja filtrada pelo banco, garantindo
    // que a rota NAO faz filtragem adicional incorreta em memoria que
    // deixaria passar outros status.
    const orders = [
      { total: "100.00", payment_method: "mp_online", payment_status: "paid" },
      { total: "50.00", payment_method: "on_delivery", payment_status: "paid" },
    ];
    const builder = makeOrdersQueryBuilder({ data: orders, error: null });
    mockFrom.mockReturnValue(builder);

    const response = await GET(authedRequest(`storeId=${STORE_ID}`));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { total: number };
    expect(body.total).toBe(150);
    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(builder.eq).toHaveBeenCalledWith("store_id", STORE_ID);
    expect(builder.eq).toHaveBeenCalledWith("payment_status", "paid");
  });

  it("segmentacao por payment_method soma exatamente o total geral", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const orders = [
      { total: "120.50", payment_method: "mp_online", payment_status: "paid" },
      { total: "30.25", payment_method: "mp_online", payment_status: "paid" },
      { total: "49.25", payment_method: "on_delivery", payment_status: "paid" },
    ];
    mockFrom.mockReturnValue(makeOrdersQueryBuilder({ data: orders, error: null }));

    const response = await GET(authedRequest(`storeId=${STORE_ID}`));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      total: number;
      byPaymentMethod: { mp_online: number; on_delivery: number };
    };
    expect(body.total).toBe(200);
    expect(body.byPaymentMethod.mp_online).toBe(150.75);
    expect(body.byPaymentMethod.on_delivery).toBe(49.25);
    expect(body.byPaymentMethod.mp_online + body.byPaymentMethod.on_delivery).toBeCloseTo(body.total, 5);
  });

  it("aplica filtro de periodo (from/to) na query", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    const builder = makeOrdersQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    const response = await GET(
      authedRequest(`storeId=${STORE_ID}&from=2026-07-01T00:00:00.000Z&to=2026-07-31T23:59:59.999Z`),
    );

    expect(response.status).toBe(200);
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-07-01T00:00:00.000Z");
    expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-07-31T23:59:59.999Z");
  });

  it("aplica filtro de forma de pagamento quando informado", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    const builder = makeOrdersQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    const response = await GET(authedRequest(`storeId=${STORE_ID}&paymentMethod=mp_online`));

    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("payment_method", "mp_online");
  });

  it("400 quando 'paymentMethod' e invalido", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const response = await GET(authedRequest(`storeId=${STORE_ID}&paymentMethod=dinheiro`));

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("500 quando a query ao banco falha", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockFrom.mockReturnValue(makeOrdersQueryBuilder({ data: null, error: { message: "boom" } }));

    const response = await GET(authedRequest(`storeId=${STORE_ID}`));

    expect(response.status).toBe(500);
  });
});
