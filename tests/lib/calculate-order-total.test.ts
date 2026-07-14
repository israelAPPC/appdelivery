import { describe, expect, it } from "vitest";
import { calculateOrderTotal } from "@/app/lib/calculate-order-total";

/**
 * Testes da regra pura de calculo do total do pedido (Task 3.2).
 * Nao usa mocks — testa a funcao real com inputs variados.
 */
describe("calculateOrderTotal", () => {
  it("soma subtotal + frete quando nao ha desconto", () => {
    expect(calculateOrderTotal({ subtotal: 50, shippingCost: 10 })).toBe(60);
  });

  it("soma subtotal + frete - desconto", () => {
    expect(calculateOrderTotal({ subtotal: 50, shippingCost: 10, discount: 15 })).toBe(45);
  });

  it("discount ausente e tratado como 0", () => {
    expect(calculateOrderTotal({ subtotal: 20, shippingCost: 0 })).toBe(20);
  });

  it("nunca retorna valor negativo, mesmo com desconto maior que subtotal + frete", () => {
    expect(calculateOrderTotal({ subtotal: 10, shippingCost: 0, discount: 100 })).toBe(0);
  });

  it("arredonda para 2 casas decimais", () => {
    expect(calculateOrderTotal({ subtotal: 10.005, shippingCost: 0, discount: 0 })).toBe(10.01);
  });
});
