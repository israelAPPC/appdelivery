import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as invite } from "@/app/api/auth/invite/route";
import { requestWithRateLimitRetry } from "../helpers/request-with-rate-limit-retry";

/**
 * Testes das rotas de auth (Task 1.2), contra o projeto Supabase real (mesmo
 * padrao de tests/db/rls.test.ts).
 *
 * Pre-requisito: migrations 0001_init.sql e
 * 0002_fix_store_bootstrap_privilege_escalation.sql aplicadas no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("rotas de auth (/api/auth/*)", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/auth.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

runIfConfigured("rotas de auth (/api/auth/*)", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  const storeIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  afterAll(async () => {
    for (const storeId of storeIdsToCleanup) {
      await admin.from("store_users").delete().eq("store_id", storeId);
      await admin.from("stores").delete().eq("id", storeId);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("POST /api/auth/signup cria usuario e loja, vinculando o criador como admin", async () => {
    const email = `signup-${suffix}@teste-app-delivery.com`;
    const response = await signup(
      jsonRequest({
        email,
        password,
        store: { name: `Loja Signup ${suffix}`, slug: `loja-signup-${suffix}` },
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };

    expect(body.user.id).toBeTruthy();
    expect(body.store.id).toBeTruthy();
    expect(body.session.access_token).toBeTruthy();

    storeIdsToCleanup.push(body.store.id);
    userIdsToCleanup.push(body.user.id);

    const { data: link } = await admin
      .from("store_users")
      .select("role, user_id")
      .eq("store_id", body.store.id)
      .single();
    expect(link?.role).toBe("admin");
    expect(link?.user_id).toBe(body.user.id);
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/signup com email duplicado retorna 400 (nunca 500)", async () => {
    const email = `signup-dup-${suffix}@teste-app-delivery.com`;
    const first = await signup(
      jsonRequest({
        email,
        password,
        store: { name: `Loja Dup ${suffix}`, slug: `loja-dup-${suffix}` },
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { user: { id: string }; store: { id: string } };
    storeIdsToCleanup.push(firstBody.store.id);
    userIdsToCleanup.push(firstBody.user.id);

    const second = await signup(
      jsonRequest({
        email,
        password,
        store: { name: `Loja Dup 2 ${suffix}`, slug: `loja-dup-2-${suffix}` },
      }),
    );
    expect(second.status).toBe(400);
    const secondBody = (await second.json()) as { error: string };
    expect(secondBody.error).toBeTruthy();
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/login autentica com credenciais validas e rejeita invalidas com 401", async () => {
    const email = `login-${suffix}@teste-app-delivery.com`;
    const { body: signupBody } = await requestWithRateLimitRetry<{ user: { id: string }; store: { id: string } }>(
      () =>
        signup(
          jsonRequest({
            email,
            password,
            store: { name: `Loja Login ${suffix}`, slug: `loja-login-${suffix}` },
          }),
        ),
    );
    storeIdsToCleanup.push(signupBody.store.id);
    userIdsToCleanup.push(signupBody.user.id);

    // Credenciais recem-criadas sao necessariamente validas: qualquer falha
    // aqui (inclusive 401 mascarado por rate limit — o /api/auth/login nunca
    // expoe a causa real do erro, de proposito, por seguranca) e transiente.
    // Repetir e seguro porque a senha esta correta por construcao do teste.
    let okResponse: Response;
    let okBody: { session: { access_token: string } };
    let attempt = 0;
    do {
      attempt += 1;
      okResponse = await login(jsonRequest({ email, password }));
      okBody = (await okResponse.json()) as { session: { access_token: string } };
      if (okResponse.status === 200) break;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    } while (attempt < 4);
    expect(okResponse.status).toBe(200);
    expect(okBody.session.access_token).toBeTruthy();

    const badResponse = await login(jsonRequest({ email, password: "senha-errada" }));
    expect(badResponse.status).toBe(401);
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/login retorna store.id quando o usuario tem loja vinculada", async () => {
    const email = `login-store-${suffix}@teste-app-delivery.com`;
    const { body: signupBody } = await requestWithRateLimitRetry<{
      user: { id: string };
      store: { id: string };
    }>(() =>
      signup(
        jsonRequest({
          email,
          password,
          store: { name: `Loja Login Store ${suffix}`, slug: `loja-login-store-${suffix}` },
        }),
      ),
    );
    storeIdsToCleanup.push(signupBody.store.id);
    userIdsToCleanup.push(signupBody.user.id);

    const { body: loginBody, response: loginResponse } = await requestWithRateLimitRetry<{
      store?: { id: string };
    }>(() => login(jsonRequest({ email, password })));
    expect(loginResponse.status).toBe(200);
    expect(loginBody.store?.id).toBe(signupBody.store.id);
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/login funciona (sem quebrar) quando o usuario nao tem loja vinculada", async () => {
    const email = `login-no-store-${suffix}@teste-app-delivery.com`;
    const admin2: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: created, error: createUserError } = await admin2.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createUserError).toBeNull();
    if (created?.user) userIdsToCleanup.push(created.user.id);

    const { body: loginBody, response: loginResponse } = await requestWithRateLimitRetry<{
      store?: { id: string };
    }>(() => login(jsonRequest({ email, password })));
    expect(loginResponse.status).toBe(200);
    expect(loginBody.store).toBeUndefined();
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/invite: admin cadastra ate 3 usuarios, e o 4o e rejeitado com erro claro", async () => {
    const adminEmail = `invite-admin-${suffix}@teste-app-delivery.com`;
    const { body: signupBody } = await requestWithRateLimitRetry<{
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    }>(() =>
      signup(
        jsonRequest({
          email: adminEmail,
          password,
          store: { name: `Loja Invite ${suffix}`, slug: `loja-invite-${suffix}` },
        }),
      ),
    );
    const storeId = signupBody.store.id;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(signupBody.user.id);
    const adminAccessToken = signupBody.session.access_token;

    // Admin ja ocupa 1 dos 3 lugares. Convida mais 2 (total 3) com sucesso.
    const employee1Email = `invite-emp1-${suffix}@teste-app-delivery.com`;
    const employee1Response = await invite(
      jsonRequest(
        {
          storeId,
          email: employee1Email,
          password,
          permissions: { orders: true, catalog: false, financial: false, settings: false },
        },
        { Authorization: `Bearer ${adminAccessToken}` },
      ),
    );
    expect(employee1Response.status).toBe(201);
    const employee1Body = (await employee1Response.json()) as { user: { id: string } };
    userIdsToCleanup.push(employee1Body.user.id);

    const employee2Email = `invite-emp2-${suffix}@teste-app-delivery.com`;
    const employee2Response = await invite(
      jsonRequest(
        {
          storeId,
          email: employee2Email,
          password,
          permissions: { orders: true, catalog: true, financial: false, settings: false },
        },
        { Authorization: `Bearer ${adminAccessToken}` },
      ),
    );
    expect(employee2Response.status).toBe(201);
    const employee2Body = (await employee2Response.json()) as { user: { id: string } };
    userIdsToCleanup.push(employee2Body.user.id);

    // 4o usuario (admin + 3 ja existiria) deve ser rejeitado.
    const employee3Email = `invite-emp3-${suffix}@teste-app-delivery.com`;
    const employee3Response = await invite(
      jsonRequest(
        {
          storeId,
          email: employee3Email,
          password,
          permissions: { orders: true, catalog: true, financial: true, settings: true },
        },
        { Authorization: `Bearer ${adminAccessToken}` },
      ),
    );
    expect(employee3Response.status).toBe(400);
    const employee3Body = (await employee3Response.json()) as { error: string };
    expect(employee3Body.error).toMatch(/limite/i);
  }, { retry: 3, timeout: 30000 });

  it("POST /api/auth/invite: funcionario com permissions restritas nao consegue acessar como se fosse admin", async () => {
    const adminEmail = `invite-restrict-admin-${suffix}@teste-app-delivery.com`;
    const { body: signupBody } = await requestWithRateLimitRetry<{
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    }>(() =>
      signup(
        jsonRequest({
          email: adminEmail,
          password,
          store: { name: `Loja Restrict ${suffix}`, slug: `loja-restrict-${suffix}` },
        }),
      ),
    );
    const storeId = signupBody.store.id;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(signupBody.user.id);
    const adminAccessToken = signupBody.session.access_token;

    const employeeEmail = `invite-restrict-emp-${suffix}@teste-app-delivery.com`;
    const employeeResponse = await invite(
      jsonRequest(
        {
          storeId,
          email: employeeEmail,
          password,
          permissions: { orders: true, catalog: false, financial: false, settings: false },
        },
        { Authorization: `Bearer ${adminAccessToken}` },
      ),
    );
    expect(employeeResponse.status).toBe(201);
    const employeeBody = (await employeeResponse.json()) as { user: { id: string } };
    userIdsToCleanup.push(employeeBody.user.id);

    // Login logo apos `invite` pode falhar de forma intermitente (401) por
    // eventual consistencia do backend de Auth do Supabase — retry curto
    // evita flakiness sem mascarar uma falha real de autenticacao.
    let employeeLoginResponse = await login(jsonRequest({ email: employeeEmail, password }));
    for (let attempt = 1; attempt < 3 && employeeLoginResponse.status !== 200; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      employeeLoginResponse = await login(jsonRequest({ email: employeeEmail, password }));
    }
    expect(employeeLoginResponse.status).toBe(200);
    const employeeLoginBody = (await employeeLoginResponse.json()) as {
      session: { access_token: string };
    };

    // Funcionario tenta convidar outro usuario (acao restrita a admin) — deve ser bloqueado.
    const forbiddenResponse = await invite(
      jsonRequest(
        {
          storeId,
          email: `invite-should-fail-${suffix}@teste-app-delivery.com`,
          password,
          permissions: { orders: true, catalog: true, financial: true, settings: true },
        },
        { Authorization: `Bearer ${employeeLoginBody.session.access_token}` },
      ),
    );
    expect(forbiddenResponse.status).toBe(403);
  }, { retry: 3, timeout: 30000 });
});
