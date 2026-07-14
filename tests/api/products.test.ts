import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createProduct, GET as listProducts } from "@/app/api/products/route";
import { PATCH as updateProduct, DELETE as deleteProduct } from "@/app/api/products/[id]/route";

/**
 * Testes das rotas de produtos (Task 2.1), contra o projeto Supabase real
 * (mesmo padrao de tests/api/auth.test.ts).
 *
 * Pre-requisito: migration supabase/migrations/0004_products.sql aplicada
 * no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("rotas de produtos (/api/products)", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/products.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function getRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "GET", headers });
}

runIfConfigured("rotas de produtos (/api/products)", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  const storeIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  let storeAId: string;
  let storeAAdminToken: string;
  let storeBId: string;
  let storeBAdminToken: string;

  beforeAll(async () => {
    const emailA = `products-store-a-${suffix}@teste-app-delivery.com`;
    const signupA = await signup(
      jsonRequest("http://localhost/api/auth/signup", "POST", {
        email: emailA,
        password,
        store: { name: `Loja Produtos A ${suffix}`, slug: `loja-produtos-a-${suffix}` },
      }),
    );
    const signupABody = (await signupA.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };
    storeAId = signupABody.store.id;
    storeAAdminToken = signupABody.session.access_token;
    storeIdsToCleanup.push(storeAId);
    userIdsToCleanup.push(signupABody.user.id);

    const emailB = `products-store-b-${suffix}@teste-app-delivery.com`;
    const signupB = await signup(
      jsonRequest("http://localhost/api/auth/signup", "POST", {
        email: emailB,
        password,
        store: { name: `Loja Produtos B ${suffix}`, slug: `loja-produtos-b-${suffix}` },
      }),
    );
    const signupBBody = (await signupB.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };
    storeBId = signupBBody.store.id;
    storeBAdminToken = signupBBody.session.access_token;
    storeIdsToCleanup.push(storeBId);
    userIdsToCleanup.push(signupBBody.user.id);
  }, 30000);

  afterAll(async () => {
    for (const storeId of storeIdsToCleanup) {
      await admin.from("products").delete().eq("store_id", storeId);
      await admin.from("store_users").delete().eq("store_id", storeId);
      await admin.from("stores").delete().eq("id", storeId);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("POST /api/products com preco negativo e rejeitado com 400", async () => {
    const response = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto Preco Negativo", price: -10 },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();
  }, { retry: 3, timeout: 30000 });

  it("POST /api/products com preco zero e rejeitado com 400", async () => {
    const response = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto Preco Zero", price: 0 },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    expect(response.status).toBe(400);
  }, { retry: 3, timeout: 30000 });

  it("POST /api/products cria produto valido (admin sempre pode)", async () => {
    const response = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Lanche Especial", price: 25.9, category: "Lanches" },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { product: { id: string; price: number } };
    expect(body.product.id).toBeTruthy();
    expect(body.product.price).toBe(25.9);
  }, { retry: 3, timeout: 30000 });

  it("produto marcado available:false nao aparece na listagem publica/anonima, mas aparece na gestao da loja", async () => {
    const createResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto Indisponivel", price: 10, available: false },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { product: { id: string } };

    // Listagem publica (sem Authorization) — nunca deve conter o produto indisponivel.
    const publicResponse = await listProducts(getRequest(`http://localhost/api/products?storeId=${storeAId}`));
    expect(publicResponse.status).toBe(200);
    const publicBody = (await publicResponse.json()) as { products: Array<{ id: string; available: boolean }> };
    expect(publicBody.products.every((p) => p.available === true)).toBe(true);
    expect(publicBody.products.map((p) => p.id)).not.toContain(created.product.id);

    // Listagem autenticada como dono da loja — deve enxergar o produto indisponivel.
    const managementResponse = await listProducts(
      getRequest(`http://localhost/api/products?storeId=${storeAId}`, {
        Authorization: `Bearer ${storeAAdminToken}`,
      }),
    );
    expect(managementResponse.status).toBe(200);
    const managementBody = (await managementResponse.json()) as { products: Array<{ id: string }> };
    expect(managementBody.products.map((p) => p.id)).toContain(created.product.id);
  }, { retry: 3, timeout: 30000 });

  it("PATCH /api/products/[id] com preco zero/negativo e rejeitado com 400", async () => {
    const createResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto Para Editar", price: 15 },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    const created = (await createResponse.json()) as { product: { id: string } };

    const patchResponse = await updateProduct(
      jsonRequest(
        `http://localhost/api/products/${created.product.id}`,
        "PATCH",
        { price: -5 },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
      { params: { id: created.product.id } },
    );
    expect(patchResponse.status).toBe(400);
  }, { retry: 3, timeout: 30000 });

  it("usuario da loja B nao consegue editar/deletar produto da loja A (RLS bloqueia)", async () => {
    const createResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto Cross Tenant", price: 30 },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    const created = (await createResponse.json()) as { product: { id: string } };

    const patchResponse = await updateProduct(
      jsonRequest(
        `http://localhost/api/products/${created.product.id}`,
        "PATCH",
        { price: 999 },
        { Authorization: `Bearer ${storeBAdminToken}` },
      ),
      { params: { id: created.product.id } },
    );
    // Produto e publico (available:true por padrao) entao a loja B consegue
    // ENXERGAR o store_id real (leitura publica de vitrine), mas nunca
    // ganha permissao 'catalog' na loja A -> 403, nunca autorizado a escrever.
    expect(patchResponse.status).toBe(403);

    const deleteResponse = await deleteProduct(
      jsonRequest(`http://localhost/api/products/${created.product.id}`, "DELETE", undefined, {
        Authorization: `Bearer ${storeBAdminToken}`,
      }),
      { params: { id: created.product.id } },
    );
    expect(deleteResponse.status).toBe(403);

    // Confirma, via service_role, que o produto da loja A permanece intacto.
    const { data: untouched } = await admin.from("products").select("price").eq("id", created.product.id).single();
    expect(untouched?.price).toBe(30);
  }, { retry: 3, timeout: 30000 });

  it("usuario da loja B nao consegue ler produto indisponivel da loja A pela listagem de gestao", async () => {
    const createResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeAId}`,
        "POST",
        { name: "Produto So Da Loja A", price: 12, available: false },
        { Authorization: `Bearer ${storeAAdminToken}` },
      ),
    );
    const created = (await createResponse.json()) as { product: { id: string } };

    const response = await listProducts(
      getRequest(`http://localhost/api/products?storeId=${storeAId}`, {
        Authorization: `Bearer ${storeBAdminToken}`,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { products: Array<{ id: string }> };
    // Loja B nao esta vinculada a loja A: cai no fallback publico, que so
    // mostra disponiveis — produto indisponivel de A nunca aparece.
    expect(body.products.map((p) => p.id)).not.toContain(created.product.id);
  }, { retry: 3, timeout: 30000 });
});
