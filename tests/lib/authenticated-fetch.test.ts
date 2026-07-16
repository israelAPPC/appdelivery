// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de `app/lib/authenticated-fetch.ts` (renovacao automatica de
 * sessao): garante que a sessao do painel admin sobrevive a expiracao do
 * `access_token` (JWT do Supabase expira em 1h) sem exigir login manual,
 * usando o `refresh_token` guardado no localStorage para renovar via
 * `auth.refreshSession` uma unica vez por chamada (nunca loop infinito).
 */

const refreshSessionMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      refreshSession: refreshSessionMock,
    },
  })),
}));

const STORAGE_KEYS = [
  "app_delivery_store_id",
  "app_delivery_access_token",
  "app_delivery_refresh_token",
  "app_delivery_role",
  "app_delivery_permissions",
] as const;

describe("authenticatedFetch", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-de-teste");

    window.localStorage.setItem("app_delivery_store_id", "store-1");
    window.localStorage.setItem("app_delivery_access_token", "token-valido");
    window.localStorage.setItem("app_delivery_refresh_token", "refresh-valido");
    window.localStorage.setItem("app_delivery_role", "admin");
    window.localStorage.setItem(
      "app_delivery_permissions",
      JSON.stringify({ orders: true, catalog: true, financial: true, settings: true }),
    );

    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "/pedidos" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("requisicao com token valido (200 direto) nao tenta renovar", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { authenticatedFetch } = await import("@/app/lib/authenticated-fetch");
    const response = await authenticatedFetch("/api/orders?storeId=store-1");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-valido");
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("recebe 401, renova a sessao e refaz a requisicao original com o novo token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "Bearer token-valido") {
        return new Response(JSON.stringify({ error: "expirado" }), { status: 401 });
      }
      if (auth === "Bearer token-novo") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`token inesperado: ${auth}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    refreshSessionMock.mockResolvedValue({
      data: {
        session: { access_token: "token-novo", refresh_token: "refresh-novo" },
      },
      error: null,
    });

    const { authenticatedFetch } = await import("@/app/lib/authenticated-fetch");
    const response = await authenticatedFetch("/api/orders?storeId=store-1");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).toHaveBeenCalledWith({ refresh_token: "refresh-valido" });
    expect(window.localStorage.getItem("app_delivery_access_token")).toBe("token-novo");
    expect(window.localStorage.getItem("app_delivery_refresh_token")).toBe("refresh-novo");
  });

  it("recebe 401 e a renovacao falha: limpa a sessao, redireciona para /login e retorna o 401 original", async () => {
    const originalResponse = new Response(JSON.stringify({ error: "expirado" }), { status: 401 });
    const fetchMock = vi.fn(async () => originalResponse.clone());
    vi.stubGlobal("fetch", fetchMock);

    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "refresh token invalido" },
    });

    const { authenticatedFetch } = await import("@/app/lib/authenticated-fetch");
    const response = await authenticatedFetch("/api/orders?storeId=store-1");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);

    for (const key of STORAGE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
    expect(window.location.href).toBe("/login");
  });
});
