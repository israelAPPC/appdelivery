import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Teste critico: limite de "no maximo 3 usuarios por loja" (Task de code
 * review: condicao de corrida em app/api/auth/invite/route.ts).
 *
 * A rota de convite validava esse limite apenas na aplicacao (SELECT count
 * antes do INSERT), sem nenhuma trava no banco — duas requisicoes
 * concorrentes podiam furar o limite. A migration
 * supabase/migrations/0003_enforce_max_users_per_store.sql move essa regra
 * para dentro do banco via trigger BEFORE INSERT (com advisory lock por
 * store_id para eliminar o TOCTOU).
 *
 * Este teste cria uma loja com 3 usuarios ja vinculados (via service_role,
 * bypassando RLS) e confirma que o 4o insert direto na tabela e REJEITADO
 * PELO BANCO (nao pela aplicacao) — ou seja, testa a trigger/constraint em
 * si, nao a rota HTTP.
 *
 * Segue o mesmo padrao de tests/db/rls.test.ts: falha explicitamente (nunca
 * skip silencioso) se credenciais ou a migration nao estiverem disponiveis,
 * pois e um teste critico de seguranca/integridade.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

/**
 * Verifica se a migration 0003_enforce_max_users_per_store.sql ja foi
 * aplicada no banco (a funcao public.enforce_max_users_per_store existe).
 * Detectamos isso indiretamente: inserimos um 4o usuario de teste em uma
 * loja com 3 vinculos e verificamos se o erro contem a mensagem esperada da
 * trigger. Como isso exige o fixture completo, fazemos uma checagem simples
 * via RPC/consulta ao catalogo do Postgres (pg_proc) usando uma query SQL
 * crua nao e exposta pelo client JS por padrao, entao assumimos a mesma
 * estrategia de rls.test.ts: se a tabela existir e as credenciais forem
 * validas, seguimos e deixamos o proprio teste de negocio revelar se a
 * trigger esta ausente (o insert do 4o usuario passaria sem erro, e o
 * `expect(error).not.toBeNull()` falharia com uma mensagem clara).
 */
async function hasStoresTable(): Promise<boolean> {
  if (!hasCredentials) return false;
  const probe = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await probe.from("stores").select("id").limit(1);
  if (!error) return true;
  const message = error.message ?? "";
  if (message.includes("Could not find the table")) return false;
  return true;
}

const schemaAvailable = hasCredentials ? await hasStoresTable() : false;

if (!hasCredentials) {
  describe("Limite de 3 usuarios por loja (store_users)", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste de seguranca nao pode ser pulado", () => {
      throw new Error(
        "tests/db/store-users-limit.test.ts requer NEXT_PUBLIC_SUPABASE_URL e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase " +
          "real. Este e um teste critico (limite de usuarios por loja) e nao pode passar sem " +
          "executar. Configure o .env (ver .env.example) e rode novamente.",
      );
    });
  });
} else if (!schemaAvailable) {
  describe("Limite de 3 usuarios por loja (store_users)", () => {
    it("FALHA: schema base (0001_init.sql) nao aplicado — teste nao pode ser pulado", () => {
      throw new Error(
        "tests/db/store-users-limit.test.ts nao encontrou a tabela public.stores no banco " +
          "Supabase configurado. Aplique as migrations em supabase/migrations/ antes de rodar " +
          "este teste (ex.: `supabase db reset` ou `supabase db push`).",
      );
    });
  });
}

const runIfConfigured = hasCredentials && schemaAvailable ? describe : describe.skip;

runIfConfigured("Limite de 3 usuarios por loja (store_users)", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  let storeId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    const { data: store, error: storeError } = await admin
      .from("stores")
      .insert({ name: `Loja Limite ${suffix}`, slug: `loja-limite-${suffix}` })
      .select("id")
      .single();
    if (storeError) throw storeError;
    storeId = store.id;

    // Cria 3 usuarios e vincula todos a loja (limite maximo permitido).
    for (let i = 0; i < 3; i += 1) {
      const email = `store-limite-${suffix}-${i}@teste-app-delivery.com`;
      const { data: user, error: userError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (userError) throw userError;
      userIds.push(user.user.id);

      const { error: linkError } = await admin
        .from("store_users")
        .insert({ store_id: storeId, user_id: user.user.id, role: i === 0 ? "admin" : "employee" });
      if (linkError) throw linkError;
    }
  }, 30000);

  afterAll(async () => {
    if (storeId) await admin.from("store_users").delete().eq("store_id", storeId);
    if (storeId) await admin.from("stores").delete().eq("id", storeId);
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("loja com 3 usuarios vinculados aceita normalmente ate o 3o usuario", async () => {
    const { data, error } = await admin
      .from("store_users")
      .select("id")
      .eq("store_id", storeId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(3);
  });

  it("o 4o insert em store_users para a mesma loja e rejeitado PELO BANCO (trigger), nao pela aplicacao", async () => {
    const email = `store-limite-${suffix}-4o@teste-app-delivery.com`;
    const { data: fourthUser, error: fourthUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (fourthUserError) throw fourthUserError;
    userIds.push(fourthUser.user.id);

    const { data, error } = await admin
      .from("store_users")
      .insert({ store_id: storeId, user_id: fourthUser.user.id, role: "employee" })
      .select();

    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/Limite de 3 usuarios por loja atingido/i);
    expect(data ?? []).toEqual([]);

    // Confirma que a contagem permanece em 3 (o insert nao "vazou" parcialmente).
    const { data: remaining, error: remainingError } = await admin
      .from("store_users")
      .select("id")
      .eq("store_id", storeId);
    expect(remainingError).toBeNull();
    expect(remaining ?? []).toHaveLength(3);
  });

  it("insercoes concorrentes na mesma loja, ja no limite, nunca ultrapassam 3 usuarios (protecao contra corrida)", async () => {
    // Dispara varias insercoes concorrentes simultaneamente para a mesma loja
    // (que ja esta no limite de 3). Sem a trigger com advisory lock, um
    // SELECT count feito na aplicacao antes de cada INSERT poderia deixar
    // todas passarem. Com a trigger, no maximo elas devem falhar todas (a
    // loja ja esta cheia).
    const concurrentEmails = Array.from(
      { length: 3 },
      (_, i) => `store-limite-${suffix}-concorrente-${i}@teste-app-delivery.com`,
    );

    const createdUsers = await Promise.all(
      concurrentEmails.map((email) =>
        admin.auth.admin.createUser({ email, password, email_confirm: true }),
      ),
    );

    for (const { data, error } of createdUsers) {
      if (error) throw error;
      userIds.push(data.user.id);
    }

    const results = await Promise.all(
      createdUsers.map(({ data }) =>
        admin
          .from("store_users")
          .insert({ store_id: storeId, user_id: data?.user?.id ?? "", role: "employee" })
          .select(),
      ),
    );

    for (const { data, error } of results) {
      expect(error).not.toBeNull();
      expect(data ?? []).toEqual([]);
    }

    const { data: remaining, error: remainingError } = await admin
      .from("store_users")
      .select("id")
      .eq("store_id", storeId);
    expect(remainingError).toBeNull();
    expect(remaining ?? []).toHaveLength(3);
  });
});

if (!hasCredentials) {
  describe("Limite de 3 usuarios por loja (store_users)", () => {
    it.skip("credenciais do Supabase nao configuradas em .env — teste ignorado", () => {});
  });
}

if (hasCredentials && !schemaAvailable) {
  describe("Limite de 3 usuarios por loja (store_users)", () => {
    it.skip(
      "schema base (0001_init.sql) ainda nao aplicado no banco real — teste ignorado ate ser aplicado",
      () => {},
    );
  });
}
