---
name: calculo-frete
description: Use ao implementar, alterar ou revisar qualquer lógica de cálculo de frete/entrega (raio grátis, preço por km, distância cliente-loja) no projeto app-delivery. Garante que a regra de negócio fique centralizada em uma função pura e testada, em vez de reimplementada em múltiplos lugares (checkout, carrinho, painel admin).
---

# Cálculo de Frete

## Quando usar
Sempre que uma task envolver: cálculo do valor do frete, validação do raio grátis configurado pela loja, cobrança por km rodado, ou exibição do valor de frete em qualquer tela (carrinho, checkout, comanda impressa).

## Regra de negócio (fonte única de verdade)
Definida em `SPEC.md` (módulo "Cálculo de Frete") e `CLAUDE.md` (testes críticos):

1. Cada loja configura `free_radius_km` (raio grátis, em km) e `price_per_km` (preço por km fora do raio) — ambos opcionais/configuráveis, podem ser `null`.
2. Se a distância cliente-loja ≤ `free_radius_km` → frete = 0.
3. Se a distância > `free_radius_km` → frete = `(distância_km - free_radius_km) × price_per_km`, salvo decisão explícita em contrário no SPEC (confirme antes de mudar a fórmula).
4. Se `price_per_km` não estiver configurado e o endereço estiver fora do raio grátis, a entrega para aquele endereço não deve ser oferecida (bloquear checkout com mensagem clara, não travar com erro genérico).
5. Pedido tipo "retirada" (`fulfillment_type: pickup`) nunca calcula frete — sempre 0, independente da distância.

## Onde implementar
- Função pura: `app/lib/calculate-shipping.ts`, exportando `calculateShippingCost(distanceKm, freeRadiusKm, pricePerKm): number`.
- Nunca duplique essa lógica dentro de componentes React ou route handlers — sempre importe a função de `app/lib/calculate-shipping.ts`.
- A obtenção da distância real (geocodificação) é uma preocupação separada (decisão em aberto no CLAUDE.md) — a skill cobre apenas o cálculo do valor a partir de uma distância já conhecida.

## TDD obrigatório
Antes de alterar `calculate-shipping.ts`, garanta que estes casos estejam cobertos em `tests/lib/calculate-shipping.test.ts`:
- [ ] Distância dentro do raio grátis → retorna 0
- [ ] Distância igual ao raio grátis (borda) → retorna 0
- [ ] Distância fora do raio → retorna `(distância - raio) × preço_km`
- [ ] `fulfillment_type: pickup` → retorna 0 independente da distância
- [ ] `price_per_km` não configurado e fora do raio → função sinaliza indisponibilidade (não retorna número negativo nem `NaN`)

## Exemplo de input/output esperado
```ts
calculateShippingCost({ distanceKm: 3, freeRadiusKm: 5, pricePerKm: 2 })
// → 0 (dentro do raio)

calculateShippingCost({ distanceKm: 8, freeRadiusKm: 5, pricePerKm: 2 })
// → 6 (3km excedentes × 2)

calculateShippingCost({ distanceKm: 8, freeRadiusKm: 5, pricePerKm: null })
// → lança erro/retorna null explícito (não permite checkout, não trata como frete grátis)
```

## Quando NÃO usar esta skill
- Para lógica de geocodificação/obtenção de coordenadas (endereço → lat/long) — isso é integração externa, não cálculo de frete em si.
- Para cupons de frete grátis — essa é responsabilidade do módulo de Cupons (aplica desconto de 100% sobre o frete já calculado, não altera a fórmula acima).
