import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signInWithRetry } from "../helpers/sign-in-with-retry";
import { createUserWithRetry } from "../helpers/create-user-with-retry";

/**
 * Testes de RLS multi-tenant (Task 1.1).
 *
 * Conecta no projeto Supabase real (credenciais em .env), cria 2 lojas
 * ficticias com 1 usuario admin cada, e verifica que a RLS de fato
 * isola os dados entre lojas (store_id).
 *
 * Pre-requisito: migration supabase/migrations/0001_init.sql precisa
 * estar aplicada no banco antes de rodar este arquivo.
 *
 * IMPORTANTE: este e um teste de seguranca critico (isolamento multi-tenant).
 * Ele NUNCA deve poder "passar" silenciosamente sem de fato executar contra
 * o banco real. Por isso, ao contrario do padrao antigo (skip silencioso),
 * a ausencia de credenciais ou da migration aplicada faz a suite FALHAR
 * explicitamente, com uma mensagem indicando o que precisa ser configurado.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

/**
 * Verifica se a migration 0001_init.sql ja foi aplicada no banco (tabela
 * `stores` existe).
 */
async function isMigrationApplied(): Promise<boolean> {
  if (!hasCredentials) return false;
  const probe = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await probe.from("stores").select("id").limit(1);
  if (!error) return true;
  const message = error.message ?? "";
  if (message.includes("Could not find the table")) return false;
  // Erro diferente de "tabela nao existe" (ex.: RLS/permissao) -> tabela existe.
  return true;
}

const migrationApplied = hasCredentials ? await isMigrationApplied() : false;

if (!hasCredentials) {
  describe("RLS multi-tenant (stores / store_users)", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste de seguranca nao pode ser pulado", () => {
      throw new Error(
        "tests/db/rls.test.ts requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
          "configuradas em .env para rodar contra um banco Supabase real. Este e um teste " +
          "critico de seguranca (isolamento multi-tenant / RLS) e nao pode passar sem executar. " +
          "Configure o .env (ver .env.example) e rode novamente.",
      );
    });
  });
} else if (!migrationApplied) {
  describe("RLS multi-tenant (stores / store_users)", () => {
    it("FALHA: migration 0001_init.sql nao aplicada — teste de seguranca nao pode ser pulado", () => {
      throw new Error(
        "tests/db/rls.test.ts nao encontrou a tabela public.stores no banco Supabase configurado. " +
          "Aplique a migration supabase/migrations/0001_init.sql antes de rodar este teste " +
          "(ex.: `supabase db reset` ou `supabase db push`). Este e um teste critico de " +
          "seguranca (isolamento multi-tenant / RLS) e nao pode passar sem executar de verdade.",
      );
    });
  });
}

const runIfConfigured = hasCredentials && migrationApplied ? describe : describe.skip;

runIfConfigured("RLS multi-tenant (stores / store_users)", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const storeAEmail = `store-a-${suffix}@teste-app-delivery.com`;
  const storeBEmail = `store-b-${suffix}@teste-app-delivery.com`;
  const password = "Senha-Teste-123!";

  let storeAId: string;
  let storeBId: string;
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(async () => {
    // Cria duas lojas ficticias via service_role (bypassa RLS).
    const { data: storeA, error: storeAError } = await admin
      .from("stores")
      .insert({ name: `Loja A ${suffix}`, slug: `loja-a-${suffix}` })
      .select("id")
      .single();
    if (storeAError) throw storeAError;
    storeAId = storeA.id;

    const { data: storeB, error: storeBError } = await admin
      .from("stores")
      .insert({ name: `Loja B ${suffix}`, slug: `loja-b-${suffix}` })
      .select("id")
      .single();
    if (storeBError) throw storeBError;
    storeBId = storeB.id;

    // Cria dois usuarios de auth, um para cada loja.
    const userA = await createUserWithRetry(admin, { email: storeAEmail, password, email_confirm: true });
    userAId = userA.id;

    const userB = await createUserWithRetry(admin, { email: storeBEmail, password, email_confirm: true });
    userBId = userB.id;

    // Vincula cada usuario como admin da sua respectiva loja (bootstrap via service_role).
    const { error: linkAError } = await admin
      .from("store_users")
      .insert({ store_id: storeAId, user_id: userAId, role: "admin" });
    if (linkAError) throw linkAError;

    const { error: linkBError } = await admin
      .from("store_users")
      .insert({ store_id: storeBId, user_id: userBId, role: "admin" });
    if (linkBError) throw linkBError;

    // Cria clients autenticados (sessao de usuario real) para os testes de RLS.
    clientA = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await signInWithRetry(clientA, storeAEmail, password);

    clientB = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await signInWithRetry(clientB, storeBEmail, password);

    anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }, 30000);

  afterAll(async () => {
    // Limpa os dados de teste (service_role bypassa RLS).
    if (storeAId) await admin.from("store_users").delete().eq("store_id", storeAId);
    if (storeBId) await admin.from("store_users").delete().eq("store_id", storeBId);
    if (storeAId) await admin.from("stores").delete().eq("id", storeAId);
    if (storeBId) await admin.from("stores").delete().eq("id", storeBId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("usuario da loja A ve a propria loja em stores (e tambem outras lojas ativas, via leitura publica da vitrine)", async () => {
    // Desde a policy stores_select_public_active (migration 0008), qualquer
    // usuario autenticado (nao so anonimo) enxerga o id de lojas ativas de
    // OUTRAS lojas tambem, pois esse e o mesmo dado publico exposto no
    // storefront (vitrine). Isolamento sensivel de verdade (vinculo
    // usuario<->loja, permissoes) continua restrito a store_users, testado
    // separadamente abaixo.
    const { data, error } = await clientA.from("stores").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(storeAId);
    expect(ids).toContain(storeBId);
  });

  it("usuario da loja A nao consegue ler store_users da loja B (RLS bloqueia)", async () => {
    const { data, error } = await clientA
      .from("store_users")
      .select("id, store_id")
      .eq("store_id", storeBId);

    // RLS deve filtrar silenciosamente: sem erro, 0 linhas.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuario da loja A nao consegue escrever (insert) em store_users da loja B", async () => {
    const { data, error } = await clientA
      .from("store_users")
      .insert({ store_id: storeBId, user_id: userAId, role: "employee" })
      .select();

    // Deve ser bloqueado pela policy store_users_insert_admin_only: usuario A
    // nao e admin da loja B, entao a insercao direta deve falhar.
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("usuario autenticado nao consegue se auto-inserir como admin de loja recem-criada por OUTRO usuario (escalonamento de privilegio bloqueado)", async () => {
    // Simula a brecha original: loja C e criada (por ex. via service_role, sem
    // vinculo de admin ainda) e o usuario A, que nao teve nenhuma participacao
    // nessa criacao, tenta descobrir o store_id e se auto-inserir como admin
    // atraves de insert direto em store_users. Como a policy de bootstrap
    // "livre" (`not store_has_users(store_id)`) foi removida, isso deve falhar
    // mesmo a loja C ainda nao tendo nenhum store_users vinculado.
    const { data: storeC, error: storeCError } = await admin
      .from("stores")
      .insert({ name: `Loja C ${suffix}`, slug: `loja-c-${suffix}` })
      .select("id")
      .single();
    expect(storeCError).toBeNull();

    const { data, error } = await clientA
      .from("store_users")
      .insert({ store_id: storeC!.id, user_id: userAId, role: "admin" })
      .select();

    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);

    await admin.from("stores").delete().eq("id", storeC!.id);
  });

  it("create_store_with_owner cria a loja e vincula o CHAMADOR (auth.uid()) como admin, atomicamente", async () => {
    const slug = `loja-rpc-${suffix}`;
    const { data, error } = await clientA.rpc("create_store_with_owner", {
      store_data: { name: `Loja RPC ${suffix}`, slug },
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const newStoreId = (data as { id: string }).id;

    // O usuario A (quem chamou a RPC) deve enxergar a loja recem-criada.
    const { data: seenByA } = await clientA.from("stores").select("id").eq("id", newStoreId);
    expect((seenByA ?? []).map((r) => r.id)).toContain(newStoreId);

    // O usuario B (nao participou da chamada) enxerga o id publico da loja
    // recem-criada apenas porque ela e ativa por padrao (stores_select_public_active,
    // migration 0008) — mesmo dado que um visitante anonimo veria na vitrine.
    // O que B nunca deve conseguir e o vinculo de store_users (testado acima).
    const { data: seenByB } = await clientB.from("stores").select("id").eq("id", newStoreId);
    expect((seenByB ?? []).map((r) => r.id)).toContain(newStoreId);

    // Verifica, via service_role, que o vinculo de admin foi criado apontando
    // exatamente para userAId (nunca para outro usuario).
    const { data: link, error: linkError } = await admin
      .from("store_users")
      .select("user_id, role")
      .eq("store_id", newStoreId)
      .single();
    expect(linkError).toBeNull();
    expect(link?.user_id).toBe(userAId);
    expect(link?.role).toBe("admin");

    await admin.from("stores").delete().eq("id", newStoreId);
  });

  it("usuario da loja A consegue ler o id da loja B por id (loja B e ativa, dado publico de vitrine)", async () => {
    const { data, error } = await clientA.from("stores").select("id").eq("id", storeBId);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id)).toContain(storeBId);
  });

  it("usuario da loja B ve a propria loja e tambem a loja A (ambas ativas, dado publico de vitrine)", async () => {
    const { data, error } = await clientB.from("stores").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(storeBId);
    expect(ids).toContain(storeAId);
  });

  it("usuario anonimo consegue ler apenas lojas ativas (vitrine publica do storefront), nunca erro 500", async () => {
    const { data, error, status } = await anonClient
      .from("stores")
      .select("id")
      .in("id", [storeAId, storeBId]);
    expect(status).toBeLessThan(500);
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    // storeA e storeB sao criadas com is_active = true (default), entao o
    // visitante anonimo deve enxergar ambas via stores_select_public_active.
    expect(ids).toContain(storeAId);
    expect(ids).toContain(storeBId);
  });

  it("usuario anonimo nao consegue ler uma loja inativa (is_active = false)", async () => {
    const { error: updateError } = await admin
      .from("stores")
      .update({ is_active: false })
      .eq("id", storeAId);
    expect(updateError).toBeNull();

    try {
      const { data, error, status } = await anonClient
        .from("stores")
        .select("id")
        .eq("id", storeAId);
      expect(status).toBeLessThan(500);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    } finally {
      await admin.from("stores").update({ is_active: true }).eq("id", storeAId);
    }
  });

  it("usuario anonimo nao consegue ler store_users de nenhuma loja", async () => {
    const { data, error, status } = await anonClient.from("store_users").select("id");
    expect(status).toBeLessThan(500);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

if (!hasCredentials) {
  describe("RLS multi-tenant (stores / store_users)", () => {
    it.skip("credenciais do Supabase nao configuradas em .env — teste ignorado", () => {});
  });
}

if (hasCredentials && !migrationApplied) {
  describe("RLS multi-tenant (stores / store_users)", () => {
    it.skip(
      "migration 0001_init.sql ainda nao aplicada no banco real — teste ignorado ate ser aplicada",
      () => {},
    );
  });
}
