import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de `/api/orders` (Task 3.3).
 *
 * `getSession`/`getStorePermissions`/`createAuthedSupabaseClient` são
 * mockados aqui porque a tabela `orders` é criada em paralelo pela Task 3.2
 * (backend-payments) — ver PLAN.md. O contrato de colunas usado no route
 * handler já segue a migration real (`supabase/migrations/0009_orders.sql`),
 * mas o teste unitário não depende de banco real estar disponível/migrado.
 *
 * Teste crítico: funcionário sem permissão `orders` nunca recebe a lista de
 * pedidos (403), mesmo que a query em si teria retornado dados.
 */

const mockGetSession = vi.fn();
const mockGetStorePermissions = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/app/lib/auth", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getStorePermissions: (...args: unknown[]) => mockGetStorePermissions(...args),
  createAuthedSupabaseClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/orders/route";
import { PATCH } from "@/app/api/orders/[id]/route";

const STORE_ID = "33333333-3333-3333-3333-333333333333";
const ORDER_ID = "44444444-4444-4444-4444-444444444444";

function makeOrderQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("GET /api/orders", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetStorePermissions.mockReset();
    mockFrom.mockReset();
  });

  it("400 quando 'storeId' nao e informado", async () => {
    const response = await GET(new Request("http://localhost/api/orders"));
    expect(response.status).toBe(400);
  });

  it("401 quando nao ha sessao autenticada", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/api/orders?storeId=${STORE_ID}`));
    expect(response.status).toBe(401);
  });

  it("403 quando o usuario nao tem permissao 'orders' desta loja", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "employee",
      permissions: { orders: false, catalog: true, financial: false, settings: false },
    });

    const response = await GET(
      new Request(`http://localhost/api/orders?storeId=${STORE_ID}`, {
        headers: { Authorization: "Bearer token-abc" },
      }),
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("200 com a lista de pedidos ordenada por created_at desc quando o usuario tem permissao", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const orders = [{ id: "order-1", store_id: STORE_ID, order_number: 1001 }];
    const builder = makeOrderQueryBuilder({ data: orders, error: null });
    mockFrom.mockReturnValue(builder);

    const response = await GET(
      new Request(`http://localhost/api/orders?storeId=${STORE_ID}`, {
        headers: { Authorization: "Bearer token-abc" },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { orders: unknown[] };
    expect(body.orders).toEqual(orders);
    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(builder.eq).toHaveBeenCalledWith("store_id", STORE_ID);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("500 quando a query ao banco falha", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockFrom.mockReturnValue(makeOrderQueryBuilder({ data: null, error: { message: "boom" } }));

    const response = await GET(
      new Request(`http://localhost/api/orders?storeId=${STORE_ID}`, {
        headers: { Authorization: "Bearer token-abc" },
      }),
    );

    expect(response.status).toBe(500);
  });
});

function makeOrderUpdateBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

/** Builder do SELECT que busca o status atual do pedido antes do UPDATE. */
function makeOrderFetchBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

/**
 * Configura `mockFrom` para o fluxo completo do PATCH: primeira chamada
 * (`select`) retorna o pedido atual, segunda chamada (`update`) e usada
 * apenas quando a transicao e valida (nao deve ser chamada quando a
 * transicao e rejeitada em 409).
 */
function mockPatchFlow(currentStatus: string, updateResult: { data: unknown; error: unknown }) {
  const fetchBuilder = makeOrderFetchBuilder({ data: { id: ORDER_ID, status: currentStatus }, error: null });
  const updateBuilder = makeOrderUpdateBuilder(updateResult);
  mockFrom.mockReturnValueOnce(fetchBuilder).mockReturnValueOnce(updateBuilder);
  return { fetchBuilder, updateBuilder };
}

function patchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/orders/${ORDER_ID}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer token-abc", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/orders/[id]", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetStorePermissions.mockReset();
    mockFrom.mockReset();
  });

  it("401 quando nao ha sessao autenticada", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(401);
  });

  it("400 quando 'status' informado nao e um OrderStatus valido", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });

    const response = await PATCH(patchRequest({ status: "invalido", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("400 quando 'storeId' nao e informado", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });

    const response = await PATCH(patchRequest({ status: "preparo" }), { params: { id: ORDER_ID } });

    expect(response.status).toBe(400);
  });

  it("403 quando o funcionario nao tem permissao 'orders' — status nao muda", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "employee",
      permissions: { orders: false, catalog: true, financial: false, settings: false },
    });

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("200 e atualiza o pedido quando a transicao e valida (recebido -> preparo)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const updatedOrder = { id: ORDER_ID, store_id: STORE_ID, status: "preparo" };
    const { updateBuilder } = mockPatchFlow("recebido", { data: updatedOrder, error: null });

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: unknown };
    expect(body.order).toEqual(updatedOrder);
    expect(mockFrom).toHaveBeenCalledWith("orders");
    expect(updateBuilder.update).toHaveBeenCalledWith({ status: "preparo" });
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", ORDER_ID);
    expect(updateBuilder.eq).toHaveBeenCalledWith("store_id", STORE_ID);
  });

  it("409 quando a transicao pula uma etapa (recebido -> concluido) e o status nao muda", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const { updateBuilder } = mockPatchFlow("recebido", { data: null, error: null });

    const response = await PATCH(patchRequest({ status: "concluido", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(409);
    expect(updateBuilder.update).not.toHaveBeenCalled();
  });

  it("409 quando a transicao retrocede (entrega -> recebido) e o status nao muda", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const { updateBuilder } = mockPatchFlow("entrega", { data: null, error: null });

    const response = await PATCH(patchRequest({ status: "recebido", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(409);
    expect(updateBuilder.update).not.toHaveBeenCalled();
  });

  it("409 quando tenta avancar um pedido ja concluido", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const { updateBuilder } = mockPatchFlow("concluido", { data: null, error: null });

    const response = await PATCH(patchRequest({ status: "concluido", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(409);
    expect(updateBuilder.update).not.toHaveBeenCalled();
  });

  it("404 quando o pedido nao existe ou pertence a outra loja (fetch do status atual nao encontra linha)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockFrom.mockReturnValue(makeOrderFetchBuilder({ data: null, error: null }));

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(404);
  });

  it("500 quando a busca do status atual falha por erro do banco", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockFrom.mockReturnValue(makeOrderFetchBuilder({ data: null, error: { message: "boom" } }));

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(500);
  });

  it("500 quando o update falha por erro do banco (transicao valida, mas UPDATE falha)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
    mockPatchFlow("recebido", { data: null, error: { message: "boom" } });

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(500);
  });
});
