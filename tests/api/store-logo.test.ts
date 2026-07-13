import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as uploadLogo } from "@/app/api/store/logo/route";
import { POST as signup } from "@/app/api/auth/signup/route";

/**
 * Teste critico: upload de logo salva URL valida no Supabase Storage
 * (Task 2.2), contra o projeto Supabase real.
 *
 * Reutiliza uma unica loja/admin criados em `beforeAll` entre os testes,
 * para reduzir o numero de chamadas de signup contra o projeto Supabase
 * real e evitar rate limit da Auth API.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("/api/store/logo", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/store-logo.test.ts requer credenciais do Supabase em .env para rodar contra um banco real.",
      );
    });
  });
}

runIfConfigured("/api/store/logo", () => {
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
    const email = `store-logo-${suffix}@teste-app-delivery.com`;
    const response = await signup(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          store: { name: `Loja Logo ${suffix}`, slug: `loja-logo-${suffix}` },
        }),
      }),
    );
    const body = (await response.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };
    storeId = body.store.id;
    accessToken = body.session.access_token;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(body.user.id);
  }, 30000);

  afterAll(async () => {
    for (const id of storeIdsToCleanup) {
      await admin.storage.from("store-logos").remove([`${id}/logo.png`]);
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("upload de logo salva URL valida no Supabase Storage e atualiza stores.logo_url", async () => {
    // PNG 1x1 minimo valido.
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const bytes = Buffer.from(pngBase64, "base64");
    const file = new File([bytes], "logo.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("storeId", storeId);
    formData.append("file", file);

    const request = new Request("http://localhost/api/store/logo", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const response = await uploadLogo(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { logoUrl: string; store: { logo_url: string } };
    expect(body.logoUrl).toMatch(/^https?:\/\//);
    expect(body.logoUrl).toContain("store-logos");
    expect(body.store.logo_url).toBe(body.logoUrl);

    // Confirma que o objeto de fato existe no Storage.
    const { data: downloaded, error } = await admin.storage
      .from("store-logos")
      .download(`${storeId}/logo.png`);
    expect(error).toBeNull();
    expect(downloaded).toBeTruthy();
  }, 30000);

  it("rejeita upload de arquivo que nao e imagem", async () => {
    const file = new File([Buffer.from("nao e imagem")], "arquivo.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("storeId", storeId);
    formData.append("file", file);

    const response = await uploadLogo(
      new Request("http://localhost/api/store/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
  }, 30000);
});
