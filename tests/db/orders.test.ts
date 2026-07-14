import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signInWithRetry } from "../helpers/sign-in-with-retry";
import { createUserWithRetry } from "../helpers/create-user-with-retry";

/**
 * Testes de RLS/schema da tabela `orders` (Task 3.2), no mesmo padrao de
 * tests/db/products.test.ts: conecta no projeto Supabase real e valida
 * diretamente as policies/constraints do banco.
 *
 * Pre-requisito: migration supabase/migrations/0009_orders.sql aplicada.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("RLS/schema da tabela orders", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste de seguranca nao pode ser pulado", () => {
      throw new Error(
        "tests/db/orders.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

runIfConfigured("RLS/schema da tabela orders", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";
  const emailA = `orders-db-a-${suffix}@teste-app-delivery.com`;
  const emailB = `orders-db-b-${suffix}@teste-app-delivery.com`;
  const emailEmployeeNoOrders = `orders-db-emp-no-${suffix}@teste-app-delivery.com`;
  const emailEmployeeWithOrders = `orders-db-emp-yes-${suffix}@teste-app-delivery.com`;

  let storeAId: string;
  let storeBId: string;
  let userAId: string;
  let userBId: string;
  let employeeNoOrdersId: string;
  let employeeWithOrdersId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let employeeNoOrdersClient: SupabaseClient;
  let employeeWithOrdersClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let orderAId: string;

  const orderIds: string[] = [];

  const baseOrder = {
    customer_name: "Cliente Teste",
    customer_phone: "11999990000",
    items: [{ productId: "produto-1", name: "Produto 1", quantity: 1, unitPrice: 10, subtotal: 10 }],
    subtotal: 10,
    shipping_cost: 0,
    discount: 0,
    total: 10,
    payment_method: "on_delivery" as const,
    payment_status: "pending_offline" as const,
    fulfillment_type: "pickup" as const,
  };

  beforeAll(async () => {
    const { data: storeA, error: storeAError } = await admin
      .from("stores")
      .insert({ name: `Loja Orders DB A ${suffix}`, slug: `loja-orders-db-a-${suffix}` })
      .select("id")
      .single();
    if (storeAError) throw storeAError;
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await admin
      .from("stores")
      .insert({ name: `Loja Orders DB B ${suffix}`, slug: `loja-orders-db-b-${suffix}` })
      .select("id")
      .single();
    if (storeBError) throw storeBError;
    storeBId = storeB.id;

    const userA = await createUserWithRetry(admin, { email: emailA, password, email_confirm: true });
    userAId = userA.id;

    const userB = await createUserWithRetry(admin, { email: emailB, password, email_confirm: true });
    userBId = userB.id;

    await admin.from("store_users").insert({ store_id: storeAId, user_id: userAId, role: "admin" });
    await admin.from("store_users").insert({ store_id: storeBId, user_id: userBId, role: "admin" });

    const employeeNoOrders = await createUserWithRetry(admin, {
      email: emailEmployeeNoOrders,
      password,
      email_confirm: true,
    });
    employeeNoOrdersId = employeeNoOrders.id;
    await admin.from("store_users").insert({
      store_id: storeAId,
      user_id: employeeNoOrdersId,
      role: "employee",
      permissions: { orders: false, catalog: true, financial: true, settings: true },
    });

    const employeeWithOrders = await createUserWithRetry(admin, {
      email: emailEmployeeWithOrders,
      password,
      email_confirm: true,
    });
    employeeWithOrdersId = employeeWithOrders.id;
    await admin.from("store_users").insert({
      store_id: storeAId,
      user_id: employeeWithOrdersId,
      role: "employee",
      permissions: { orders: true, catalog: false, financial: false, settings: false },
    });

    clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await signInWithRetry(clientA, emailA, password);

    clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await signInWithRetry(clientB, emailB, password);

    employeeNoOrdersClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await signInWithRetry(employeeNoOrdersClient, emailEmployeeNoOrders, password);

    employeeWithOrdersClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await signInWithRetry(employeeWithOrdersClient, emailEmployeeWithOrders, password);

    anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: orderA, error: orderAError } = await admin
      .from("orders")
      .insert({ ...baseOrder, store_id: storeAId })
      .select("id")
      .single();
    if (orderAError) throw orderAError;
    orderAId = orderA.id;
    orderIds.push(orderAId);
  }, 30000);

  afterAll(async () => {
    for (const id of orderIds) await admin.from("orders").delete().eq("id", id);
    if (storeAId) await admin.from("store_users").delete().eq("store_id", storeAId);
    if (storeBId) await admin.from("store_users").delete().eq("store_id", storeBId);
    if (storeAId) await admin.from("stores").delete().eq("id", storeAId);
    if (storeBId) await admin.from("stores").delete().eq("id", storeBId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
    if (employeeNoOrdersId) await admin.auth.admin.deleteUser(employeeNoOrdersId);
    if (employeeWithOrdersId) await admin.auth.admin.deleteUser(employeeWithOrdersId);
  });

  it("constraint do banco rejeita pedido de entrega sem delivery_address", async () => {
    const { data, error } = await admin
      .from("orders")
      .insert({ ...baseOrder, store_id: storeAId, fulfillment_type: "delivery", delivery_address: null })
      .select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("constraint do banco rejeita pedido de retirada com delivery_address preenchido", async () => {
    const { data, error } = await admin
      .from("orders")
      .insert({
        ...baseOrder,
        store_id: storeAId,
        fulfillment_type: "pickup",
        delivery_address: { street: "Rua X" },
      })
      .select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("dono da loja consegue ler os proprios pedidos", async () => {
    const { data, error } = await clientA.from("orders").select("id").eq("store_id", storeAId);
    expect(error).toBeNull();
    expect((data ?? []).map((o) => o.id)).toContain(orderAId);
  });

  it("usuario anonimo (sem sessao) nao consegue ler nenhum pedido", async () => {
    const { data, error } = await anonClient.from("orders").select("id").eq("store_id", storeAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("usuario anonimo (sem sessao) nao consegue inserir pedido diretamente na tabela (insercao e exclusiva do route handler via service_role)", async () => {
    const { data, error } = await anonClient.from("orders").insert({ ...baseOrder, store_id: storeAId }).select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("usuario da loja B nao consegue ler pedido da loja A (RLS bloqueia cross-tenant)", async () => {
    const { data, error } = await clientB.from("orders").select("id").eq("store_id", storeAId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("usuario da loja B nao consegue atualizar pedido da loja A (RLS bloqueia cross-tenant)", async () => {
    const { data: updateResult, error: updateError } = await clientB
      .from("orders")
      .update({ status: "concluido" })
      .eq("id", orderAId)
      .select();
    expect(updateError).toBeNull();
    expect(updateResult ?? []).toEqual([]);

    const { data: untouched } = await admin.from("orders").select("status").eq("id", orderAId).single();
    expect(untouched?.status).toBe("recebido");
  });

  it("usuario da loja B nao consegue inserir pedido na loja A (RLS bloqueia escrita cross-tenant)", async () => {
    const { data, error } = await clientB.from("orders").insert({ ...baseOrder, store_id: storeAId }).select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("funcionario com permissions.orders = false NAO consegue atualizar pedido da propria loja (RLS bloqueia permissao granular)", async () => {
    const { data: updateResult, error: updateError } = await employeeNoOrdersClient
      .from("orders")
      .update({ status: "preparo" })
      .eq("id", orderAId)
      .select();
    expect(updateError).toBeNull();
    expect(updateResult ?? []).toEqual([]);

    const { data: untouched } = await admin.from("orders").select("status").eq("id", orderAId).single();
    expect(untouched?.status).toBe("recebido");
  });

  it("funcionario com permissions.orders = true CONSEGUE atualizar pedido da propria loja", async () => {
    const { data: updateResult, error: updateError } = await employeeWithOrdersClient
      .from("orders")
      .update({ status: "preparo" })
      .eq("id", orderAId)
      .select();
    expect(updateError).toBeNull();
    expect((updateResult ?? []).map((o) => o.id)).toContain(orderAId);

    const { data: updated } = await admin.from("orders").select("status").eq("id", orderAId).single();
    expect(updated?.status).toBe("preparo");

    // Restaura o status para nao afetar outros testes que dependem do estado inicial.
    await admin.from("orders").update({ status: "recebido" }).eq("id", orderAId);
  });

  it("admin (role = admin) consegue atualizar pedido da propria loja mesmo sem checkbox de permissao explicito", async () => {
    const { data: updateResult, error: updateError } = await clientA
      .from("orders")
      .update({ status: "entrega" })
      .eq("id", orderAId)
      .select();
    expect(updateError).toBeNull();
    expect((updateResult ?? []).map((o) => o.id)).toContain(orderAId);

    await admin.from("orders").update({ status: "recebido" }).eq("id", orderAId);
  });
});
