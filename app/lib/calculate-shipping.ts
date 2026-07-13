/**
 * Calculo do valor de frete (skill `calculo-frete` / CLAUDE.md, testes criticos).
 *
 * Fonte unica de verdade da regra de negocio. Nunca duplicar esta logica em
 * componentes React ou route handlers — sempre importar esta funcao.
 *
 * Regras:
 *  1. `fulfillmentType: "pickup"` nunca calcula frete -> sempre 0.
 *  2. Se `distanceKm <= freeRadiusKm` (raio nao configurado = 0) -> 0.
 *  3. Se `distanceKm > freeRadiusKm`:
 *     - `pricePerKm` configurado -> `(distanceKm - freeRadiusKm) * pricePerKm`.
 *     - `pricePerKm` nao configurado (null) -> retorna `null` (indisponibilidade
 *       explicita: bloquear checkout com mensagem clara, nunca `NaN`/negativo).
 */

export type FulfillmentType = "delivery" | "pickup";

export type CalculateShippingCostInput = {
  distanceKm: number;
  freeRadiusKm: number | null;
  pricePerKm: number | null;
  fulfillmentType: FulfillmentType;
};

/**
 * Calcula o custo de frete em reais.
 *
 * @returns o valor do frete (>= 0), ou `null` quando o frete e indisponivel
 * (fora do raio gratis e sem `pricePerKm` configurado) — o chamador deve
 * tratar `null` bloqueando o checkout com mensagem clara, nunca como frete
 * gratis nem como erro generico.
 */
export function calculateShippingCost({
  distanceKm,
  freeRadiusKm,
  pricePerKm,
  fulfillmentType,
}: CalculateShippingCostInput): number | null {
  if (fulfillmentType === "pickup") {
    return 0;
  }

  const effectiveFreeRadiusKm = freeRadiusKm ?? 0;

  if (distanceKm <= effectiveFreeRadiusKm) {
    return 0;
  }

  if (pricePerKm === null) {
    return null;
  }

  const distanceOverRadiusKm = distanceKm - effectiveFreeRadiusKm;
  return distanceOverRadiusKm * pricePerKm;
}
