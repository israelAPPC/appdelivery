// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Order } from "@/app/lib/orders";

/**
 * Testes do painel de pedidos em tempo real (Task 3.3):
 *  - novo pedido inserido no banco aparece no painel sem reload de pagina;
 *  - mudanca de status (`preparo` -> `entrega`) e refletida em tempo real.
 *
 * O client Supabase (`app/lib/supabase.ts`) e mockado para nao abrir uma
 * conexao de Realtime real — em vez disso, capturamos o callback registrado
 * em `.on("postgres_changes", ...)` e o disparamos manualmente para simular
 * o evento que o Realtime entregaria, sempre com o mesmo `filter` de
 * `store_id` que o componente deve usar (nunca cross-tenant).
 */

type RealtimeCallback = (payload: unknown) => void;

let capturedCallback: RealtimeCallback | null = null;
let capturedFilter: string | null = null;
const removeChannelMock = vi.fn();

vi.mock("@/app/lib/supabase", () => {
  return {
    supabase: {
      channel: vi.fn(() => {
        const channel = {
          on: vi.fn((_event: string, config: { filter: string }, callback: RealtimeCallback) => {
            capturedCallback = callback;
            capturedFilter = config.filter;
            return channel;
          }),
          subscribe: vi.fn(() => channel),
        };
        return channel;
      }),
      removeChannel: removeChannelMock,
    },
  };
});

const STORE_ID = "22222222-2222-2222-2222-222222222222";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    store_id: STORE_ID,
    order_number: 1001,
    customer_name: "Maria Silva",
    customer_phone: "11999990000",
    delivery_address: { street: "Rua A", number: "123" },
    items: [{ productId: "prod-1", name: "Pizza", quantity: 1, unitPrice: 50, subtotal: 50 }],
    subtotal: 50,
    shipping_cost: 5,
    discount: 0,
    total: 55,
    payment_method: "on_delivery",
    payment_status: "pending_offline",
    fulfillment_type: "delivery",
    status: "recebido",
    created_at: "2026-07-13T10:00:00.000Z",
    ...overrides,
  };
}

describe("PedidosPage", () => {
  beforeEach(() => {
    capturedCallback = null;
    capturedFilter = null;
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("novo pedido inserido aparece no painel sem reload (via evento realtime)", async () => {
    const initialOrder = makeOrder({ id: "order-1", order_number: 1001 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ orders: [initialOrder] }), { status: 200 })),
    );

    const { default: PedidosPage } = await import("@/app/(admin)/pedidos/page");
    render(<PedidosPage />);

    await waitFor(() => expect(screen.getAllByText("#1001").length).toBeGreaterThan(0));

    // Subscription deve filtrar por store_id desta loja (nunca cross-tenant).
    expect(capturedFilter).toBe(`store_id=eq.${STORE_ID}`);
    expect(capturedCallback).toBeTruthy();

    const newOrder = makeOrder({
      id: "order-2",
      order_number: 1002,
      customer_name: "João Souza",
      created_at: "2026-07-13T11:00:00.000Z",
    });

    act(() => {
      capturedCallback!({ eventType: "INSERT", new: newOrder });
    });

    await waitFor(() => expect(screen.getAllByText("#1002").length).toBeGreaterThan(0));
    expect(screen.getAllByText("João Souza").length).toBeGreaterThan(0);
    // Pedido antigo continua visivel.
    expect(screen.getAllByText("#1001").length).toBeGreaterThan(0);
  });

  it("mudanca de status (preparo -> entrega) e refletida em tempo real", async () => {
    const initialOrder = makeOrder({ id: "order-1", order_number: 1001, status: "preparo" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ orders: [initialOrder] }), { status: 200 })),
    );

    const { default: PedidosPage } = await import("@/app/(admin)/pedidos/page");
    render(<PedidosPage />);

    await waitFor(() => expect(screen.getAllByText("Em preparo").length).toBeGreaterThan(0));

    const updatedOrder = makeOrder({ id: "order-1", order_number: 1001, status: "entrega" });
    act(() => {
      capturedCallback!({ eventType: "UPDATE", new: updatedOrder });
    });

    await waitFor(() => expect(screen.getAllByText("Em entrega").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("Em preparo").length).toBe(0);
  });

  it("clique em 'Avançar status' dispara PATCH para /api/orders/:id com o proximo status", async () => {
    const initialOrder = makeOrder({ id: "order-1", order_number: 1001, status: "recebido" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ order: { ...initialOrder, status: "preparo" } }),
          { status: 200 },
        );
      }
      if (url.includes("/api/orders?")) {
        return new Response(JSON.stringify({ orders: [initialOrder] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: PedidosPage } = await import("@/app/(admin)/pedidos/page");
    render(<PedidosPage />);

    await waitFor(() => expect(screen.getAllByText("#1001").length).toBeGreaterThan(0));

    const buttons = screen.getAllByTestId("advance-status-button");
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
      expect(patchCall).toBeTruthy();
    });

    const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")!;
    expect(patchCall[0]).toBe(`/api/orders/${initialOrder.id}`);
    const body = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(body).toEqual({ status: "preparo", storeId: STORE_ID });
  });

  it("funcionario sem permissao 'orders' (403 do backend) nao ve a lista de pedidos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "sem permissao" }), { status: 403 })),
    );

    const { default: PedidosPage } = await import("@/app/(admin)/pedidos/page");
    render(<PedidosPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/não tem permissão/i);
  });
});
