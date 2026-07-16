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
const mockSendOrderStatusNotification = vi.fn();

vi.mock("@/app/lib/auth", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getStorePermissions: (...args: unknown[]) => mockGetStorePermissions(...args),
  createAuthedSupabaseClient: () => ({ from: mockFrom }),
}));

// `sendOrderStatusNotification` (Task 4.3) e mockada aqui: o PATCH so
// precisa garantir que ela e chamada apos o UPDATE ter sucesso, e que uma
// falha dela nunca derruba a resposta da rota — o disparo real de push e
// testado em tests/lib/notifications.test.ts.
vi.mock("@/app/lib/notifications", () => ({
  sendOrderStatusNotification: (...args: unknown[]) => mockSendOrderStatusNotification(...args),
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
    mockSendOrderStatusNotification.mockReset();
    mockSendOrderStatusNotification.mockResolvedValue(undefined);
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

  it("dispara exatamente 1 notificacao de push apos o status ser atualizado com sucesso", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const updatedOrder = { id: ORDER_ID, store_id: STORE_ID, status: "preparo" };
    mockPatchFlow("recebido", { data: updatedOrder, error: null });

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(200);
    expect(mockSendOrderStatusNotification).toHaveBeenCalledTimes(1);
    expect(mockSendOrderStatusNotification).toHaveBeenCalledWith(ORDER_ID, "preparo");
  });

  it("falha no envio da notificacao de push nao derruba a resposta de sucesso do PATCH", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });

    const updatedOrder = { id: ORDER_ID, store_id: STORE_ID, status: "preparo" };
    mockPatchFlow("recebido", { data: updatedOrder, error: null });
    mockSendOrderStatusNotification.mockRejectedValue(new Error("push provider indisponivel"));

    const response = await PATCH(patchRequest({ status: "preparo", storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: unknown };
    expect(body.order).toEqual(updatedOrder);
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

describe("PATCH /api/orders/[id] — markAsPaid (pagar na entrega/retirada)", () => {
  /** Builder do SELECT que busca o pedido atual (status + pagamento) antes do UPDATE/refetch. */
  function makeCurrentOrderFetchBuilder(result: { data: unknown; error: unknown }) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(result)),
    };
    return builder;
  }

  function mockMarkAsPaidFlow(
    current: { status: string; payment_method: string; payment_status: string },
  ): { fetchBuilder: ReturnType<typeof makeCurrentOrderFetchBuilder> };
  function mockMarkAsPaidFlow(
    current: { status: string; payment_method: string; payment_status: string },
    updateResult: { data: unknown; error: unknown },
  ): {
    fetchBuilder: ReturnType<typeof makeCurrentOrderFetchBuilder>;
    updateBuilder: ReturnType<typeof makeOrderUpdateBuilder>;
  };
  function mockMarkAsPaidFlow(
    current: { status: string; payment_method: string; payment_status: string },
    updateResult?: { data: unknown; error: unknown },
  ) {
    const fetchBuilder = makeCurrentOrderFetchBuilder({
      data: { id: ORDER_ID, ...current },
      error: null,
    });
    if (!updateResult) {
      mockFrom.mockReturnValueOnce(fetchBuilder);
      return { fetchBuilder };
    }
    const updateBuilder = makeOrderUpdateBuilder(updateResult);
    mockFrom.mockReturnValueOnce(fetchBuilder).mockReturnValueOnce(updateBuilder);
    return { fetchBuilder, updateBuilder };
  }

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetStorePermissions.mockReset();
    mockFrom.mockReset();
    mockSendOrderStatusNotification.mockReset();
    mockSendOrderStatusNotification.mockResolvedValue(undefined);
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, accessToken: "token-abc" });
    mockGetStorePermissions.mockResolvedValue({
      role: "admin",
      permissions: { orders: true, catalog: true, financial: true, settings: true },
    });
  });

  it("marca um pedido on_delivery com payment_status pending_offline como pago", async () => {
    const updatedOrder = {
      id: ORDER_ID,
      store_id: STORE_ID,
      payment_method: "on_delivery",
      payment_status: "paid",
    };
    const { updateBuilder } = mockMarkAsPaidFlow(
      { status: "entrega", payment_method: "on_delivery", payment_status: "pending_offline" },
      { data: updatedOrder, error: null },
    );

    const response = await PATCH(patchRequest({ markAsPaid: true, storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: { payment_status: string } };
    expect(body.order.payment_status).toBe("paid");
    expect(updateBuilder.update).toHaveBeenCalledWith({ payment_status: "paid" });
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", ORDER_ID);
    expect(updateBuilder.eq).toHaveBeenCalledWith("store_id", STORE_ID);
    // markAsPaid nunca dispara a notificacao de mudanca de status operacional.
    expect(mockSendOrderStatusNotification).not.toHaveBeenCalled();
  });

  it("400 ao tentar marcar como pago um pedido mp_online (so o webhook do Mercado Pago pode)", async () => {
    const { fetchBuilder } = mockMarkAsPaidFlow({
      status: "entrega",
      payment_method: "mp_online",
      payment_status: "pending",
    });
    void fetchBuilder;

    const response = await PATCH(patchRequest({ markAsPaid: true, storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(400);
  });

  it("400 ao tentar marcar como pago um pedido on_delivery com payment_status diferente de pending_offline (ex.: failed)", async () => {
    mockMarkAsPaidFlow({ status: "entrega", payment_method: "on_delivery", payment_status: "failed" });

    const response = await PATCH(patchRequest({ markAsPaid: true, storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(400);
  });

  it("idempotente: marcar como pago um pedido on_delivery ja pago retorna 200 sem novo UPDATE", async () => {
    // Primeira chamada a `from`: busca o pedido atual (ja pago). Segunda
    // chamada: refetch do pedido completo para a resposta (sem UPDATE, ja
    // que marcar como pago um pedido ja pago nao gera efeito colateral).
    const initialFetch = makeCurrentOrderFetchBuilder({
      data: { id: ORDER_ID, status: "concluido", payment_method: "on_delivery", payment_status: "paid" },
      error: null,
    });
    const refetchBuilder = makeOrderFetchBuilder({
      data: {
        id: ORDER_ID,
        store_id: STORE_ID,
        payment_method: "on_delivery",
        payment_status: "paid",
        status: "concluido",
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(initialFetch).mockReturnValueOnce(refetchBuilder);

    const response = await PATCH(patchRequest({ markAsPaid: true, storeId: STORE_ID }), {
      params: { id: ORDER_ID },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: { payment_status: string } };
    expect(body.order.payment_status).toBe("paid");
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("marca como pago e avanca o status operacional na mesma requisicao", async () => {
    const updatedOrder = {
      id: ORDER_ID,
      store_id: STORE_ID,
      status: "concluido",
      payment_method: "on_delivery",
      payment_status: "paid",
    };
    const { updateBuilder } = mockMarkAsPaidFlow(
      { status: "entrega", payment_method: "on_delivery", payment_status: "pending_offline" },
      { data: updatedOrder, error: null },
    );

    const response = await PATCH(
      patchRequest({ status: "concluido", markAsPaid: true, storeId: STORE_ID }),
      { params: { id: ORDER_ID } },
    );

    expect(response.status).toBe(200);
    expect(updateBuilder.update).toHaveBeenCalledWith({ status: "concluido", payment_status: "paid" });
    expect(mockSendOrderStatusNotification).toHaveBeenCalledTimes(1);
  });

  it("400 quando nem 'status' nem 'markAsPaid' sao informados", async () => {
    const response = await PATCH(patchRequest({ storeId: STORE_ID }), { params: { id: ORDER_ID } });
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
