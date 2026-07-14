import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GET, PATCH } from "@/app/api/store/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { signInWithRetry } from "../helpers/sign-in-with-retry";
import { requestWithRateLimitRetry } from "../helpers/request-with-rate-limit-retry";

/**
 * Testes de /api/store (Task 2.2), contra o projeto Supabase real (mesmo
 * padrao de tests/api/auth.test.ts).
 *
 * Reutiliza uma unica loja/admin criados em `beforeAll` entre a maioria dos
 * testes (em vez de 1 signup por `it`) para reduzir o numero de chamadas de
 * signup contra o projeto Supabase real e evitar rate limit da Auth API.
 *
 * Pre-requisito: migrations ate 0005_store_shipping_and_logo_storage.sql
 * aplicadas no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("/api/store", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/store.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

runIfConfigured("/api/store", () => {
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
    const email = `store-owner-${suffix}@teste-app-delivery.com`;
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
              name: `Loja Store ${suffix}`,
              slug: `loja-store-${suffix}`,
              address_street: "Rua Original",
              address_city: "Cidade Original",
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
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("GET retorna os dados da propria loja do usuario autenticado", async () => {
    const response = await GET(
      new Request(`http://localhost/api/store?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { store: { id: string } };
    expect(body.store.id).toBe(storeId);
  }, { retry: 3, timeout: 30000 });

  it("PATCH aceita free_radius_km e price_per_km numericos validos (>= 0)", async () => {
    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/store",
        { storeId, free_radius_km: 5, price_per_km: 2.5 },
        { Authorization: `Bearer ${accessToken}` },
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { store: { free_radius_km: number; price_per_km: number } };
    expect(Number(body.store.free_radius_km)).toBe(5);
    expect(Number(body.store.price_per_km)).toBe(2.5);
  }, { retry: 3, timeout: 30000 });

  it("PATCH rejeita free_radius_km negativo com 400", async () => {
    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/store",
        { storeId, free_radius_km: -1 },
        { Authorization: `Bearer ${accessToken}` },
      ),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();
  }, { retry: 3, timeout: 30000 });

  it("PATCH rejeita price_per_km negativo com 400", async () => {
    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/store",
        { storeId, price_per_km: -0.01 },
        { Authorization: `Bearer ${accessToken}` },
      ),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();
  }, { retry: 3, timeout: 30000 });

  it("PATCH rejeita limpar o endereco (rua/cidade vazias) para nao quebrar o calculo de frete", async () => {
    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/store",
        { storeId, address_street: "" },
        { Authorization: `Bearer ${accessToken}` },
      ),
    );

    expect(response.status).toBe(400);
  }, { retry: 3, timeout: 30000 });

  it("PATCH bloqueia funcionario sem permissao 'settings'", async () => {
    const employeeEmail = `store-emp-${suffix}@teste-app-delivery.com`;
    const { data: employeeUser } = await admin.auth.admin.createUser({
      email: employeeEmail,
      password,
      email_confirm: true,
    });
    expect(employeeUser?.user).toBeTruthy();
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
    expect(session.access_token).toBeTruthy();

    const response = await PATCH(
      jsonRequest(
        "http://localhost/api/store",
        { storeId, free_radius_km: 3 },
        { Authorization: `Bearer ${session.access_token}` },
      ),
    );

    expect(response.status).toBe(403);
  }, { retry: 3, timeout: 30000 });
});
