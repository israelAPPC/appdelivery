// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CartItem } from "@/app/lib/cart";

/**
 * Testes de componente da página de carrinho (Fase 3):
 *  - renderização de itens/subtotal a partir do carrinho salvo no localStorage;
 *  - retirada (pickup) zera o frete sem chamar /api/shipping/estimate;
 *  - entrega (delivery) chama /api/shipping/estimate e exibe frete/total;
 *  - endereço vazio em entrega bloqueia a estimativa sem chamar a API;
 *  - ajustar quantidade recalcula subtotal/total.
 *
 * Mocka-se apenas a rede (fetch) e o localStorage — as regras de cálculo
 * (subtotal, atualização de quantidade) são as funções reais de
 * `app/lib/cart.ts`, nunca mockadas (ver .claude/rules/tests/tests.md).
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "loja-teste" }),
}));

const STORE_SLUG = "loja-teste";

function cartStorageKey(storeSlug: string) {
  return `app-delivery:cart:${storeSlug}`;
}

function seedCart(items: CartItem[]) {
  window.localStorage.setItem(cartStorageKey(STORE_SLUG), JSON.stringify(items));
}

describe("CartPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    window.localStorage.clear();
  });

  it("renderiza os itens do carrinho e o subtotal corretamente", async () => {
    seedCart([
      { productId: "p1", name: "Pizza Marguerita", price: 40, quantity: 2 },
      { productId: "p2", name: "Refrigerante", price: 8, quantity: 1 },
    ]);

    const { default: CartPage } = await import("@/app/(storefront)/loja/[slug]/carrinho/page");
    render(<CartPage />);

    await waitFor(() => expect(screen.getByText("Pizza Marguerita")).toBeTruthy());
    expect(screen.getByText("Refrigerante")).toBeTruthy();

    // subtotal = 40*2 + 8*1 = 88
    expect(screen.getAllByText("R$ 88,00").length).toBeGreaterThan(0);
  });

  it("retirada (pickup) zera o frete sem chamar /api/shipping/estimate", async () => {
    seedCart([{ productId: "p1", name: "Pizza Marguerita", price: 40, quantity: 1 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { default: CartPage } = await import("@/app/(storefront)/loja/[slug]/carrinho/page");
    render(<CartPage />);

    await waitFor(() => expect(screen.getByText("Pizza Marguerita")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Retirada" }));
    fireEvent.click(screen.getByRole("button", { name: "Calcular frete" }));

    await waitFor(() => expect(screen.getByText(/Frete: R\$ 0,00/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();

    // Total = subtotal (40) já que frete é 0.
    expect(screen.getAllByText("R$ 40,00").length).toBeGreaterThan(0);
  });

  it("entrega com endereço preenchido chama /api/shipping/estimate e exibe frete/total", async () => {
    seedCart([{ productId: "p1", name: "Pizza Marguerita", price: 40, quantity: 1 }]);
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ shippingCost: 10, distanceKm: 4 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { default: CartPage } = await import("@/app/(storefront)/loja/[slug]/carrinho/page");
    render(<CartPage />);

    await waitFor(() => expect(screen.getByText("Pizza Marguerita")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Endereço de entrega"), {
      target: { value: "Rua A, 123, Centro, Cidade" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Calcular frete" }));
    });

    await waitFor(() => expect(screen.getByText(/Frete: R\$ 10,00/)).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/shipping/estimate");
    if (!options || typeof options.body !== "string") {
      throw new Error("Esperava options.body como string na chamada de fetch");
    }
    expect(JSON.parse(options.body)).toEqual({
      storeSlug: STORE_SLUG,
      address: "Rua A, 123, Centro, Cidade",
      fulfillmentType: "delivery",
    });

    // Total = subtotal (40) + frete (10) = 50
    expect(screen.getAllByText("R$ 50,00").length).toBeGreaterThan(0);
  });

  it("endereço vazio em entrega bloqueia a estimativa sem chamar a API", async () => {
    seedCart([{ productId: "p1", name: "Pizza Marguerita", price: 40, quantity: 1 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { default: CartPage } = await import("@/app/(storefront)/loja/[slug]/carrinho/page");
    render(<CartPage />);

    await waitFor(() => expect(screen.getByText("Pizza Marguerita")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Calcular frete" }));

    await waitFor(() =>
      expect(screen.getByText("Informe o endereço de entrega.")).toBeTruthy(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ajustar quantidade recalcula o subtotal/total", async () => {
    seedCart([{ productId: "p1", name: "Pizza Marguerita", price: 40, quantity: 1 }]);

    const { default: CartPage } = await import("@/app/(storefront)/loja/[slug]/carrinho/page");
    render(<CartPage />);

    await waitFor(() => expect(screen.getByText("Pizza Marguerita")).toBeTruthy());
    expect(screen.getAllByText("R$ 40,00").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Aumentar quantidade" }));

    await waitFor(() => expect(screen.getAllByText("R$ 80,00").length).toBeGreaterThan(0));

    // Persistiu no localStorage.
    const stored = JSON.parse(
      window.localStorage.getItem(cartStorageKey(STORE_SLUG)) ?? "[]",
    );
    expect(stored[0].quantity).toBe(2);
  });
});
