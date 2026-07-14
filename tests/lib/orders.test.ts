import { describe, expect, it } from "vitest";
import { applyOrderRealtimeEvent, nextOrderStatus, type Order, type OrderStatus } from "@/app/lib/orders";

/**
 * Testes da logica pura de aplicacao de eventos de Realtime do painel de
 * pedidos (Task 3.3). Nao usa mocks de rede/Supabase — testa apenas a
 * funcao de reducer que o componente usa para atualizar o estado em tela
 * sem reload, dado o payload que a subscription do Realtime entregaria.
 */

const STORE_ID = "11111111-1111-1111-1111-111111111111";

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

describe("applyOrderRealtimeEvent", () => {
  it("INSERT: novo pedido aparece na lista sem reload de pagina", () => {
    const initial: Order[] = [makeOrder({ id: "order-1" })];
    const newOrder = makeOrder({ id: "order-2", order_number: 1002, created_at: "2026-07-13T11:00:00.000Z" });

    const result = applyOrderRealtimeEvent(initial, { eventType: "INSERT", new: newOrder });

    expect(result.map((order) => order.id)).toContain("order-2");
    expect(result).toHaveLength(2);
    // Pedido mais recente aparece primeiro.
    expect(result[0].id).toBe("order-2");
  });

  it("INSERT duplicado (mesmo id ja presente) nao duplica a linha", () => {
    const initial: Order[] = [makeOrder({ id: "order-1" })];
    const result = applyOrderRealtimeEvent(initial, { eventType: "INSERT", new: makeOrder({ id: "order-1" }) });

    expect(result).toHaveLength(1);
  });

  it("UPDATE: mudanca de status (preparo -> entrega) e refletida no pedido correto", () => {
    const initial: Order[] = [
      makeOrder({ id: "order-1", status: "preparo" }),
      makeOrder({ id: "order-2", status: "recebido" }),
    ];

    const result = applyOrderRealtimeEvent(initial, {
      eventType: "UPDATE",
      new: makeOrder({ id: "order-1", status: "entrega" }),
    });

    expect(result.find((order) => order.id === "order-1")?.status).toBe("entrega");
    expect(result.find((order) => order.id === "order-2")?.status).toBe("recebido");
  });

  it("UPDATE de pedido inexistente na lista nao adiciona nada nem quebra", () => {
    const initial: Order[] = [makeOrder({ id: "order-1" })];
    const result = applyOrderRealtimeEvent(initial, {
      eventType: "UPDATE",
      new: makeOrder({ id: "order-999", status: "entrega" }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("order-1");
  });

  it("DELETE remove o pedido pelo id", () => {
    const initial: Order[] = [makeOrder({ id: "order-1" }), makeOrder({ id: "order-2" })];
    const result = applyOrderRealtimeEvent(initial, { eventType: "DELETE", old: { id: "order-1" } });

    expect(result.map((order) => order.id)).toEqual(["order-2"]);
  });
});

describe("nextOrderStatus", () => {
  it("recebido -> preparo", () => {
    expect(nextOrderStatus("recebido")).toBe("preparo");
  });

  it("preparo -> entrega", () => {
    expect(nextOrderStatus("preparo")).toBe("entrega");
  });

  it("entrega -> concluido", () => {
    expect(nextOrderStatus("entrega")).toBe("concluido");
  });

  it("concluido -> null (nao ha proximo status)", () => {
    expect(nextOrderStatus("concluido")).toBeNull();
  });

  it("nunca retorna um status fora do fluxo definido", () => {
    const statuses: OrderStatus[] = ["recebido", "preparo", "entrega", "concluido"];
    for (const status of statuses) {
      const next = nextOrderStatus(status);
      if (next !== null) {
        expect(statuses).toContain(next);
      }
    }
  });
});
