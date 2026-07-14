import "server-only";
import { calculateShippingCost, type FulfillmentType } from "@/app/lib/calculate-shipping";
import { getCustomerDistanceKm, type Coordinates } from "@/app/lib/geocode-distance";

/**
 * Resolucao de frete para pedidos de entrega — fonte unica compartilhada
 * entre `/api/checkout` e `/api/shipping/estimate`, para nunca duplicar a
 * orquestracao "geocodificar endereco do cliente -> calcular distancia até
 * a loja -> aplicar `calculateShippingCost`" (seguranca.md: frete sempre
 * recalculado no backend, nunca confiando em `distanceKm` enviado pelo
 * client).
 *
 * `calculateShippingCost` continua sendo a UNICA fonte da regra de valor de
 * frete (skill `calculo-frete`) — este modulo apenas decide QUAL distancia
 * alimenta essa funcao.
 */

export type ResolveDeliveryShippingInput = {
  fulfillmentType: FulfillmentType;
  /** Endereco em texto livre do cliente, usado para geocodificacao. Ignorado para `pickup`. */
  address?: string | null;
  /** Coordenadas cadastradas da loja. `null` = loja sem endereco cadastrado. */
  storeCoordinates: Coordinates | null;
  freeRadiusKm: number | null;
  pricePerKm: number | null;
};

export type ResolveDeliveryShippingResult =
  | { shippingCost: number; distanceKm: number; error?: undefined }
  | { shippingCost: null; distanceKm: number | null; error: string };

/**
 * Resolve o frete de um pedido, geocodificando o endereco do cliente e
 * calculando a distancia real ate a loja quando `fulfillmentType ===
 * "delivery"`. Para `pickup`, retorna frete 0 sem geocodificar (nunca faz
 * chamada externa desnecessaria).
 *
 * Nunca lanca exceçao — qualquer falha (loja sem coordenadas, endereco nao
 * geocodificavel, fora da area de entrega) retorna `shippingCost: null` com
 * uma mensagem de erro clara, para o chamador responder 400.
 */
export async function resolveDeliveryShipping(
  input: ResolveDeliveryShippingInput,
): Promise<ResolveDeliveryShippingResult> {
  if (input.fulfillmentType === "pickup") {
    return { shippingCost: 0, distanceKm: 0 };
  }

  if (!input.storeCoordinates) {
    return {
      shippingCost: null,
      distanceKm: null,
      error: "Loja sem endereco cadastrado — frete indisponivel.",
    };
  }

  if (!input.address || !input.address.trim()) {
    return {
      shippingCost: null,
      distanceKm: null,
      error: "Endereco do cliente e obrigatorio para calcular o frete.",
    };
  }

  const distanceKm = await getCustomerDistanceKm(input.storeCoordinates, input.address);

  if (distanceKm === null) {
    return {
      shippingCost: null,
      distanceKm: null,
      error: "Nao foi possivel calcular a distancia para este endereco.",
    };
  }

  const shippingCost = calculateShippingCost({
    distanceKm,
    freeRadiusKm: input.freeRadiusKm,
    pricePerKm: input.pricePerKm,
    fulfillmentType: "delivery",
  });

  if (shippingCost === null) {
    return {
      shippingCost: null,
      distanceKm,
      error: "Frete indisponivel para este endereco (fora da area de entrega configurada pela loja).",
    };
  }

  return { shippingCost, distanceKm };
}
