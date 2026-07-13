import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStorePermissions } from "@/app/lib/auth";

/**
 * Testes de `getStorePermissions` (Task 1.2).
 *
 * Roda contra o projeto Supabase real (mesmo padrao de tests/db/rls.test.ts):
 * cria uma loja de teste, um usuario admin e um usuario funcionario com
 * permissoes restritas, e verifica a resolucao de permissoes efetivas.
 *
 * Pre-requisito: migrations 0001_init.sql e 0002_..._privilege_escalation.sql
 * aplicadas no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("getStorePermissions", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/lib/auth.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

runIfConfigured("getStorePermissions", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  let storeId: string;
  let adminUserId: string;
  let employeeUserId: string;
  let adminClient: SupabaseClient;
  let employeeClient: SupabaseClient;

  beforeAll(async () => {
    const { data: store, error: storeError } = await admin
      .from("stores")
      .insert({ name: `Loja Auth ${suffix}`, slug: `loja-auth-${suffix}` })
      .select("id")
      .single();
    if (storeError) throw storeError;
    storeId = store.id;

    const adminEmail = `auth-admin-${suffix}@teste-app-delivery.com`;
    const employeeEmail = `auth-employee-${suffix}@teste-app-delivery.com`;

    const { data: adminUser, error: adminUserError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (adminUserError) throw adminUserError;
    adminUserId = adminUser.user.id;

    const { data: employeeUser, error: employeeUserError } = await admin.auth.admin.createUser({
      email: employeeEmail,
      password,
      email_confirm: true,
    });
    if (employeeUserError) throw employeeUserError;
    employeeUserId = employeeUser.user.id;

    // Admin com permissions "restritivas" salva por engano — deve ser
    // ignorado: admin sempre tem acesso total.
    const { error: adminLinkError } = await admin.from("store_users").insert({
      store_id: storeId,
      user_id: adminUserId,
      role: "admin",
      permissions: { orders: false, catalog: false, financial: false, settings: false },
    });
    if (adminLinkError) throw adminLinkError;

    // Funcionario com acesso restrito: pode ver pedidos, nao pode ver catalogo.
    const { error: employeeLinkError } = await admin.from("store_users").insert({
      store_id: storeId,
      user_id: employeeUserId,
      role: "employee",
      permissions: { orders: true, catalog: false, financial: false, settings: false },
    });
    if (employeeLinkError) throw employeeLinkError;

    adminClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: adminSignInError } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password,
    });
    if (adminSignInError) throw adminSignInError;

    employeeClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: employeeSignInError } = await employeeClient.auth.signInWithPassword({
      email: employeeEmail,
      password,
    });
    if (employeeSignInError) throw employeeSignInError;
  }, 30000);

  afterAll(async () => {
    if (storeId) await admin.from("store_users").delete().eq("store_id", storeId);
    if (storeId) await admin.from("stores").delete().eq("id", storeId);
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
    if (employeeUserId) await admin.auth.admin.deleteUser(employeeUserId);
  });

  it("admin sempre tem acesso total, independente do valor salvo em `permissions`", async () => {
    const access = await getStorePermissions(adminUserId, storeId, adminClient);

    expect(access).not.toBeNull();
    expect(access?.role).toBe("admin");
    expect(access?.permissions).toEqual({
      orders: true,
      catalog: true,
      financial: true,
      settings: true,
    });
  });

  it("funcionario com permissions restritas (orders:true, catalog:false) tem catalog bloqueado", async () => {
    const access = await getStorePermissions(employeeUserId, storeId, employeeClient);

    expect(access).not.toBeNull();
    expect(access?.role).toBe("employee");
    expect(access?.permissions.orders).toBe(true);
    expect(access?.permissions.catalog).toBe(false);
    expect(access?.permissions.financial).toBe(false);
    expect(access?.permissions.settings).toBe(false);
  });

  it("retorna null para usuario sem vinculo com a loja", async () => {
    const access = await getStorePermissions(employeeUserId, "00000000-0000-0000-0000-000000000000", employeeClient);
    expect(access).toBeNull();
  });
});
