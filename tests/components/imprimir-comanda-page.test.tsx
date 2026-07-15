// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Order } from "@/app/lib/orders";

/**
 * Testes da tela de impressao de comanda (Task 4.2):
 *  - renderiza nome da loja, numero do pedido, itens, cliente, forma de
 *    pagamento e status corretamente;
 *  - pedido de retirada (`pickup`) nunca mostra endereco de entrega;
 *  - pedido de entrega (`delivery`) mostra o endereco.
 */

const STORE_ID = "22222222-2222-2222-2222-222222222222";
const ORDER_ID = "order-1";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    store_id: STORE_ID,
    order_number: 1001,
    customer_name: "Maria Silva",
    customer_phone: "11999990000",
    delivery_address: { street: "Rua A", number: "123", neighborhood: "Centro", city: "São Paulo" },
    items: [{ productId: "prod-1", name: "Pizza", quantity: 2, unitPrice: 50, subtotal: 100 }],
    subtotal: 100,
    shipping_cost: 5,
    discount: 0,
    total: 105,
    payment_method: "on_delivery",
    payment_status: "pending_offline",
    fulfillment_type: "delivery",
    status: "recebido",
    created_at: "2026-07-13T10:00:00.000Z",
    ...overrides,
  };
}

function stubFetch(order: Order, storeName = "Pizzaria do João") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/store")) {
        return new Response(JSON.stringify({ store: { name: storeName } }), { status: 200 });
      }
      if (url.startsWith("/api/orders")) {
        return new Response(JSON.stringify({ orders: [order] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("ImprimirComandaPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("renderiza nome da loja, numero do pedido, itens, cliente e pagamento", async () => {
    const order = makeOrder({
      payment_method: "mp_online",
      payment_status: "paid",
    });
    stubFetch(order);

    const { default: ImprimirComandaPage } = await import("@/app/(admin)/pedidos/[id]/imprimir/page");
    render(<ImprimirComandaPage params={{ id: ORDER_ID }} />);

    await waitFor(() => expect(screen.getByText("Pizzaria do João")).toBeTruthy());
    expect(screen.getByText("Pedido #1001")).toBeTruthy();
    expect(screen.getByText("Cliente: Maria Silva")).toBeTruthy();
    expect(screen.getByText(/2x Pizza/)).toBeTruthy();
    expect(screen.getByText(/Mercado Pago — Pago/)).toBeTruthy();
  });

  it("pedido 'pagar na entrega', aguardando pagamento MP", async () => {
    const order = makeOrder({ payment_method: "mp_online", payment_status: "pending" });
    stubFetch(order);

    const { default: ImprimirComandaPage } = await import("@/app/(admin)/pedidos/[id]/imprimir/page");
    render(<ImprimirComandaPage params={{ id: ORDER_ID }} />);

    await waitFor(() => expect(screen.getByText(/Mercado Pago — Aguardando pagamento/)).toBeTruthy());
  });

  it("pedido de retirada (pickup) NAO renderiza nenhum campo de endereco de entrega", async () => {
    const order = makeOrder({ fulfillment_type: "pickup", delivery_address: null });
    stubFetch(order);

    const { default: ImprimirComandaPage } = await import("@/app/(admin)/pedidos/[id]/imprimir/page");
    render(<ImprimirComandaPage params={{ id: ORDER_ID }} />);

    await waitFor(() => expect(screen.getByText("Retirada no local")).toBeTruthy());
    expect(screen.queryByTestId("comanda-address")).toBeNull();
    expect(screen.queryByText(/Endereço:/)).toBeNull();
    expect(screen.getByText(/Pagar na retirada/)).toBeTruthy();
  });

  it("pedido de entrega (delivery) SIM renderiza o endereco", async () => {
    const order = makeOrder({ fulfillment_type: "delivery" });
    stubFetch(order);

    const { default: ImprimirComandaPage } = await import("@/app/(admin)/pedidos/[id]/imprimir/page");
    render(<ImprimirComandaPage params={{ id: ORDER_ID }} />);

    await waitFor(() => expect(screen.getByTestId("comanda-address")).toBeTruthy());
    expect(screen.getByText(/Rua A, 123 - Centro - São Paulo/)).toBeTruthy();
  });
});
