/**
 * Calculo do valor total de um pedido (Task 3.2 — checkout).
 *
 * Fonte unica de verdade da regra de negocio. Nunca duplicar esta logica em
 * componentes React ou route handlers — sempre importar esta funcao.
 *
 * Regra (CLAUDE.md/seguranca.md): total = subtotal (soma dos produtos) +
 * frete - desconto. Este valor e SEMPRE recalculado no backend a partir do
 * subtotal/frete/desconto ja validados — nunca aceito diretamente do client.
 *
 * O desconto de cupom (Fase 5) ainda nao tem regra de calculo propria; por
 * enquanto este modulo apenas aplica um valor de desconto ja calculado
 * (0 por padrao), sem bloquear o checkout.
 */

export type CalculateOrderTotalInput = {
  subtotal: number;
  shippingCost: number;
  discount?: number;
};

/**
 * Calcula o total do pedido. Nunca retorna um valor negativo: se o desconto
 * for maior que subtotal + frete, o total fica zerado.
 */
export function calculateOrderTotal({ subtotal, shippingCost, discount = 0 }: CalculateOrderTotalInput): number {
  const total = subtotal + shippingCost - discount;
  return total < 0 ? 0 : Math.round(total * 100) / 100;
}
