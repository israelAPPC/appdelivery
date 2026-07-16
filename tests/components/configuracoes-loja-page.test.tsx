// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Testes da tela de configuracao da loja (`app/(admin)/configuracoes/loja/page.tsx`):
 *  - carrega e exibe os dados atuais da loja (GET /api/store);
 *  - salva alteracoes com sucesso (PATCH /api/store);
 *  - mostra erro quando a API rejeita (ex: frete negativo, 400).
 *
 * `fetch` global e mockado — sem chamada real a rede/Supabase.
 */

vi.mock("@/app/lib/admin-session-context", () => ({
  useAdminSession: () => ({
    storeId: window.localStorage.getItem("app_delivery_store_id"),
    accessToken: window.localStorage.getItem("app_delivery_access_token"),
    role: null,
    permissions: null,
    logout: vi.fn(),
  }),
}));

const STORE_ID = "33333333-3333-3333-3333-333333333333";

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ID,
    name: "Loja da Maria",
    address_street: "Rua das Flores",
    address_number: "100",
    address_neighborhood: "Centro",
    address_city: "São Paulo",
    address_state: "SP",
    address_zip_code: "01000-000",
    phone: "11988887777",
    whatsapp_number: "11988887777",
    opening_hours: { segunda: { abre: "08:00", fecha: "18:00" } },
    free_radius_km: 3,
    price_per_km: 2.5,
    logo_url: null,
    ...overrides,
  };
}

describe("ConfiguracoesLojaPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("carrega e exibe os dados atuais da loja", async () => {
    const store = makeStore();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/store?")) {
          return new Response(JSON.stringify({ store }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { default: ConfiguracoesLojaPage } = await import("@/app/(admin)/configuracoes/loja/page");
    render(<ConfiguracoesLojaPage />);

    await waitFor(() => expect(screen.getByDisplayValue("Loja da Maria")).toBeTruthy());
    expect(screen.getByDisplayValue("Rua das Flores")).toBeTruthy();
    expect(screen.getByDisplayValue("São Paulo")).toBeTruthy();
    expect(screen.getByDisplayValue("3")).toBeTruthy();
    expect(screen.getByDisplayValue("2.5")).toBeTruthy();
  });

  it("salva alteracoes com sucesso", async () => {
    const store = makeStore();
    const updatedStore = makeStore({ name: "Loja da Maria - Atualizada", free_radius_km: 5 });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/store?")) {
        return new Response(JSON.stringify({ store }), { status: 200 });
      }
      if (url === "/api/store" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ store: updatedStore }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: ConfiguracoesLojaPage } = await import("@/app/(admin)/configuracoes/loja/page");
    render(<ConfiguracoesLojaPage />);

    await waitFor(() => expect(screen.getByDisplayValue("Loja da Maria")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nome da loja"), {
      target: { value: "Loja da Maria - Atualizada" },
    });
    fireEvent.change(screen.getByLabelText("Raio grátis (km)"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/sucesso/i);

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    )!;
    expect(patchCall[0]).toBe("/api/store");
    const body = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(body.storeId).toBe(STORE_ID);
    expect(body.name).toBe("Loja da Maria - Atualizada");
    expect(body.free_radius_km).toBe(5);
  });

  it("mostra erro de validação quando a API rejeita (frete negativo)", async () => {
    const store = makeStore();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/store?")) {
        return new Response(JSON.stringify({ store }), { status: 200 });
      }
      if (url === "/api/store" && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ error: "Campo 'free_radius_km' deve ser um numero maior ou igual a zero, ou null." }),
          { status: 400 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: ConfiguracoesLojaPage } = await import("@/app/(admin)/configuracoes/loja/page");
    render(<ConfiguracoesLojaPage />);

    await waitFor(() => expect(screen.getByDisplayValue("Loja da Maria")).toBeTruthy());

    // Bypassa a validacao client-side simulando um valor negativo numerico
    // (input type=number aceita "-1"), para confirmar que o erro do backend
    // e propagado e exibido com role="alert".
    fireEvent.change(screen.getByLabelText("Raio grátis (km)"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/maior ou igual a zero/i);
  });
});
