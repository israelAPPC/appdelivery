// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Testes da tela de cardapio do painel admin (gestao de produtos):
 *  - lista produtos existentes ao carregar (GET /api/products);
 *  - cria um produto novo com sucesso e ele aparece na lista (POST);
 *  - mostra erro quando a API retorna erro (role="alert").
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

const STORE_ID = "11111111-1111-1111-1111-111111111111";

type Product = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  category: string | null;
  photo_url: string | null;
  available: boolean;
  created_at: string;
  updated_at: string;
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    store_id: STORE_ID,
    name: "Pizza Margherita",
    price: 39.9,
    category: "Pizzas",
    photo_url: null,
    available: true,
    created_at: "2026-07-15T10:00:00.000Z",
    updated_at: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("CardapioPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("lista produtos existentes ao carregar", async () => {
    const existingProduct = makeProduct();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ products: [existingProduct] }), { status: 200 })),
    );

    const { default: CardapioPage } = await import("@/app/(admin)/cardapio/page");
    render(<CardapioPage />);

    await waitFor(() => expect(screen.getByText("Pizza Margherita")).toBeTruthy());
    expect(screen.getByText(/39.90/)).toBeTruthy();
  });

  it("cria um produto novo com sucesso e ele aparece na lista", async () => {
    const newProduct = makeProduct({ id: "prod-2", name: "Coca-Cola 2L", price: 12, category: "Bebidas" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ product: newProduct }), { status: 201 });
      }
      if (url.includes("/api/products?")) {
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: CardapioPage } = await import("@/app/(admin)/cardapio/page");
    render(<CardapioPage />);

    await waitFor(() => expect(screen.getByText(/Nenhum produto cadastrado/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Coca-Cola 2L" } });
    fireEvent.change(screen.getByLabelText("Preço"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "Bebidas" } });
    fireEvent.click(screen.getByRole("button", { name: /adicionar produto/i }));

    await waitFor(() => expect(screen.getByText("Coca-Cola 2L")).toBeTruthy());

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toEqual({
      storeId: STORE_ID,
      name: "Coca-Cola 2L",
      price: 12,
      category: "Bebidas",
      photoUrl: undefined,
      available: true,
    });
  });

  it("mostra erro quando a API retorna erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "sem permissao" }), { status: 403 })),
    );

    const { default: CardapioPage } = await import("@/app/(admin)/cardapio/page");
    render(<CardapioPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/sem permissao/i);
  });
});
