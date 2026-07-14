import { describe, expect, it } from "vitest";
import {
  addItemToCart,
  calculateCartSubtotal,
  removeItemFromCart,
  updateItemQuantity,
  type CartItem,
} from "@/app/lib/cart";

describe("cart", () => {
  const burger: CartItem = { productId: "1", name: "X-Burger", price: 20, quantity: 1 };
  const fries: CartItem = { productId: "2", name: "Batata", price: 10, quantity: 2 };

  it("addItemToCart adiciona um novo item", () => {
    const result = addItemToCart([], burger);
    expect(result).toEqual([burger]);
  });

  it("addItemToCart soma quantidade quando o produto já existe, sem duplicar linha", () => {
    const result = addItemToCart([burger], { ...burger, quantity: 2 });
    expect(result).toEqual([{ ...burger, quantity: 3 }]);
  });

  it("removeItemFromCart remove o item pelo productId", () => {
    const result = removeItemFromCart([burger, fries], "1");
    expect(result).toEqual([fries]);
  });

  it("updateItemQuantity atualiza a quantidade de um item existente", () => {
    const result = updateItemQuantity([burger], "1", 5);
    expect(result).toEqual([{ ...burger, quantity: 5 }]);
  });

  it("updateItemQuantity com quantidade <= 0 remove o item (nunca deixa quantidade zero/negativa)", () => {
    expect(updateItemQuantity([burger], "1", 0)).toEqual([]);
    expect(updateItemQuantity([burger], "1", -1)).toEqual([]);
  });

  it("calculateCartSubtotal soma price x quantity de todos os itens", () => {
    expect(calculateCartSubtotal([burger, fries])).toBe(20 * 1 + 10 * 2);
  });

  it("calculateCartSubtotal de carrinho vazio retorna 0", () => {
    expect(calculateCartSubtotal([])).toBe(0);
  });
});
