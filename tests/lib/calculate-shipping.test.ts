import { describe, expect, it } from "vitest";
import { calculateShippingCost } from "@/app/lib/calculate-shipping";

/**
 * Testes da regra pura de calculo de frete (skill calculo-frete).
 * Nao usa mocks — testa a funcao real com inputs variados.
 */
describe("calculateShippingCost", () => {
  it("distancia dentro do raio gratis retorna 0", () => {
    expect(
      calculateShippingCost({ distanceKm: 3, freeRadiusKm: 5, pricePerKm: 2, fulfillmentType: "delivery" }),
    ).toBe(0);
  });

  it("distancia igual ao raio gratis (borda) retorna 0", () => {
    expect(
      calculateShippingCost({ distanceKm: 5, freeRadiusKm: 5, pricePerKm: 2, fulfillmentType: "delivery" }),
    ).toBe(0);
  });

  it("distancia fora do raio retorna (distancia - raio) x preco_km", () => {
    expect(
      calculateShippingCost({ distanceKm: 8, freeRadiusKm: 5, pricePerKm: 2, fulfillmentType: "delivery" }),
    ).toBe(6);
  });

  it("fulfillmentType 'pickup' retorna 0 independente da distancia", () => {
    expect(
      calculateShippingCost({
        distanceKm: 100,
        freeRadiusKm: 5,
        pricePerKm: 2,
        fulfillmentType: "pickup",
      }),
    ).toBe(0);
  });

  it("price_per_km nao configurado e fora do raio sinaliza indisponibilidade (null), nunca NaN/negativo", () => {
    const result = calculateShippingCost({
      distanceKm: 8,
      freeRadiusKm: 5,
      pricePerKm: null,
      fulfillmentType: "delivery",
    });
    expect(result).toBeNull();
  });

  it("free_radius_km nao configurado (null) trata como raio zero (qualquer distancia > 0 e cobrada)", () => {
    expect(
      calculateShippingCost({ distanceKm: 4, freeRadiusKm: null, pricePerKm: 2, fulfillmentType: "delivery" }),
    ).toBe(8);
  });
});
