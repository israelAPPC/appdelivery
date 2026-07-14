import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signInWithRetry } from "../helpers/sign-in-with-retry";
import { createUserWithRetry } from "../helpers/create-user-with-retry";

/**
 * Testes de RLS/schema da tabela `products` (Task 2.1), no mesmo padrao de
 * tests/db/rls.test.ts: conecta no projeto Supabase real e valida
 * diretamente as policies/constraints do banco (sem passar pelas rotas de
 * API, que ja sao cobertas em tests/api/products.test.ts).
 *
 * Pre-requisito: migration supabase/migrations/0004_products.sql aplicada.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("RLS/schema da tabela products", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste de seguranca nao pode ser pulado", () => {
      throw new Error(
        "tests/db/products.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

runIfConfigured("RLS/schema da tabela products", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";
  const emailA = `products-db-a-${suffix}@teste-app-delivery.com`;
  const emailB = `products-db-b-${suffix}@teste-app-delivery.com`;

  let storeAId: string;
  let storeBId: string;
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let anonClient: SupabaseClient;

  const productIds: string[] = [];

  beforeAll(async () => {
    const { data: storeA, error: storeAError } = await admin
      .from("stores")
      .insert({ name: `Loja Produtos DB A ${suffix}`, slug: `loja-produtos-db-a-${suffix}` })
      .select("id")
      .single();
    if (storeAError) throw storeAError;
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await admin
      .from("stores")
      .insert({ name: `Loja Produtos DB B ${suffix}`, slug: `loja-produtos-db-b-${suffix}` })
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

    clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await signInWithRetry(clientA, emailA, password);

    clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await signInWithRetry(clientB, emailB, password);

    anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }, 30000);

  afterAll(async () => {
    for (const id of productIds) await admin.from("products").delete().eq("id", id);
    if (storeAId) await admin.from("store_users").delete().eq("store_id", storeAId);
    if (storeBId) await admin.from("store_users").delete().eq("store_id", storeBId);
    if (storeAId) await admin.from("stores").delete().eq("id", storeAId);
    if (storeBId) await admin.from("stores").delete().eq("id", storeBId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("constraint do banco rejeita price <= 0 mesmo via insert direto (service_role)", async () => {
    const { data, error } = await admin
      .from("products")
      .insert({ store_id: storeAId, name: "Produto Invalido", price: 0 })
      .select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("dono da loja consegue criar produto e enxergar mesmo quando indisponivel", async () => {
    const { data, error } = await clientA
      .from("products")
      .insert({ store_id: storeAId, name: "Produto Disponivel A", price: 19.9, available: true })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) productIds.push(data.id);

    const { data: unavailable, error: unavailableError } = await clientA
      .from("products")
      .insert({ store_id: storeAId, name: "Produto Indisponivel A", price: 9.9, available: false })
      .select()
      .single();
    expect(unavailableError).toBeNull();
    if (unavailable?.id) productIds.push(unavailable.id);

    const { data: ownList } = await clientA.from("products").select("id").eq("store_id", storeAId);
    expect((ownList ?? []).map((p) => p.id)).toContain(unavailable?.id);
  });

  it("usuario anonimo so ve produtos available:true, nunca indisponiveis", async () => {
    const { data, error } = await anonClient
      .from("products")
      .select("id, available")
      .eq("store_id", storeAId);

    expect(error).toBeNull();
    expect((data ?? []).every((p) => p.available === true)).toBe(true);
  });

  it("usuario da loja B nao consegue ler produto indisponivel da loja A (so enxerga os disponiveis, via policy publica)", async () => {
    const { data, error } = await clientB.from("products").select("id, available").eq("store_id", storeAId);
    expect(error).toBeNull();
    // A policy de leitura publica (products_select_public_available) e
    // deliberadamente aberta para qualquer available:true, independente da
    // loja (vitrine publica) — mas o produto marcado available:false da loja
    // A nunca deve aparecer para o usuario da loja B (nem para ninguem fora
    // da propria loja).
    expect((data ?? []).every((p) => p.available === true)).toBe(true);
  });

  it("usuario da loja B nao consegue inserir produto na loja A (RLS bloqueia escrita cross-tenant)", async () => {
    const { data, error } = await clientB
      .from("products")
      .insert({ store_id: storeAId, name: "Produto Invasor", price: 5 })
      .select();
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("usuario da loja B nao consegue atualizar/deletar produto da loja A (RLS bloqueia)", async () => {
    const { data: productA } = await clientA
      .from("products")
      .insert({ store_id: storeAId, name: "Produto Alvo B", price: 42 })
      .select()
      .single();
    if (productA?.id) productIds.push(productA.id);

    const { data: updateResult, error: updateError } = await clientB
      .from("products")
      .update({ price: 1 })
      .eq("id", productA!.id)
      .select();
    expect(updateError).toBeNull();
    expect(updateResult ?? []).toEqual([]);

    const { data: deleteResult, error: deleteError } = await clientB
      .from("products")
      .delete()
      .eq("id", productA!.id)
      .select();
    expect(deleteError).toBeNull();
    expect(deleteResult ?? []).toEqual([]);

    const { data: untouched } = await admin.from("products").select("price").eq("id", productA!.id).single();
    expect(untouched?.price).toBe(42);
  });
});
