import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GET, POST } from "@/app/api/store/credentials/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { hasProviderConfigured } from "@/app/lib/store-credentials";
import { signInWithRetry } from "../helpers/sign-in-with-retry";
import { requestWithRateLimitRetry } from "../helpers/request-with-rate-limit-retry";

/**
 * Testes de /api/store/credentials e app/lib/store-credentials.ts (Task 2.4).
 *
 * Teste critico principal: a chave salva nunca e retornada em texto plano
 * por nenhuma rota GET — verificado programaticamente varrendo o JSON de
 * resposta em busca do valor original.
 *
 * Reutiliza uma unica loja/admin criados em `beforeAll` entre a maioria dos
 * testes, para reduzir o numero de chamadas de signup contra o projeto
 * Supabase real e evitar rate limit da Auth API.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("/api/store/credentials", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/store-credentials.test.ts requer credenciais do Supabase em .env para rodar contra um banco real.",
      );
    });
  });
}

/** Varre recursivamente um objeto JSON procurando uma string especifica em qualquer campo. */
function jsonContainsValue(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => jsonContainsValue(item, needle));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => jsonContainsValue(item, needle));
  }
  return false;
}

runIfConfigured("/api/store/credentials", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";
  const storeIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  let storeId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = `store-cred-${suffix}@teste-app-delivery.com`;
    const { body } = await requestWithRateLimitRetry<{
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    }>(() =>
      signup(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            store: {
              name: `Loja Credencial ${suffix}`,
              slug: `loja-credencial-${suffix}`,
            },
          }),
        }),
      ),
    );
    storeId = body.store.id;
    accessToken = body.session.access_token;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(body.user.id);
  }, 30000);

  afterAll(async () => {
    for (const id of storeIdsToCleanup) {
      await admin.from("store_credentials").delete().eq("store_id", id);
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("GET retorna 'nao configurada' quando nenhuma credencial foi salva", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/store/credentials?storeId=${storeId}&provider=whatsapp`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { configured: boolean; last4: string | null };
    expect(body.configured).toBe(false);
    expect(body.last4).toBeNull();
  }, { retry: 3, timeout: 30000 });

  it("POST salva a credencial; GET nunca retorna o valor em texto plano em nenhum campo", async () => {
    const secretValue = "APP_USR-super-secreto-1234567890-abcdef";

    const postResponse = await POST(
      new Request("http://localhost/api/store/credentials", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ storeId, provider: "mercado_pago", value: secretValue }),
      }),
    );

    expect(postResponse.status).toBe(201);
    const postBody = (await postResponse.json()) as unknown;
    expect(jsonContainsValue(postBody, secretValue)).toBe(false);

    const getResponse = await GET(
      new Request(
        `http://localhost/api/store/credentials?storeId=${storeId}&provider=mercado_pago`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { configured: boolean; last4: string | null };
    expect(jsonContainsValue(getBody, secretValue)).toBe(false);
    expect(getBody.configured).toBe(true);
    expect(getBody.last4).toBe(secretValue.slice(-4));
  }, { retry: 3, timeout: 30000 });

  it("bloqueia funcionario sem permissao 'settings'", async () => {
    const employeeEmail = `store-cred-emp-${suffix}@teste-app-delivery.com`;
    const { data: employeeUser } = await admin.auth.admin.createUser({
      email: employeeEmail,
      password,
      email_confirm: true,
    });
    userIdsToCleanup.push(employeeUser!.user!.id);

    await admin.from("store_users").insert({
      store_id: storeId,
      user_id: employeeUser!.user!.id,
      role: "employee",
      permissions: { orders: true, catalog: true, financial: false, settings: false },
    });

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const session = await signInWithRetry(anon, employeeEmail, password);

    const response = await POST(
      new Request("http://localhost/api/store/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ storeId, provider: "mercado_pago", value: "qualquer-coisa" }),
      }),
    );

    expect(response.status).toBe(403);
  }, { retry: 3, timeout: 30000 });

  it("hasProviderConfigured: loja sem whatsapp configurado retorna false; apos salvar mercado_pago, whatsapp continua false", async () => {
    expect(await hasProviderConfigured(storeId, "whatsapp")).toBe(false);
    // mercado_pago foi configurado no teste anterior desta mesma loja.
    expect(await hasProviderConfigured(storeId, "mercado_pago")).toBe(true);
  }, { retry: 3, timeout: 30000 });
});
