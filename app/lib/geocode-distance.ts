import "server-only";

/**
 * Geocodificação de endereço e cálculo de distância loja-cliente via
 * OpenRouteService (gratuito, chave em `OPENROUTESERVICE_API_KEY`).
 *
 * Esta é a única responsabilidade deste módulo: obter `distanceKm` entre a
 * loja e o endereço do cliente. O cálculo do valor de frete a partir dessa
 * distância é responsabilidade exclusiva de `app/lib/calculate-shipping.ts`
 * (skill `calculo-frete`) — nunca duplicar a regra aqui.
 *
 * Qualquer falha (geocodificação sem resultado, API indisponível, chave não
 * configurada) retorna `null` explicitamente — nunca lança exceção para o
 * chamador, para não quebrar a UI do carrinho. O chamador deve tratar `null`
 * bloqueando o avanço do pedido com mensagem clara ("não foi possível
 * calcular o frete para este endereço").
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car";

/**
 * Geocodifica um endereço em texto livre para coordenadas usando a API de
 * geocodificação do OpenRouteService.
 *
 * @returns coordenadas do primeiro resultado, ou `null` se não houver
 * resultado, a chave não estiver configurada, ou a chamada falhar.
 */
export async function geocodeAddress(query: string): Promise<Coordinates | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey || !query.trim()) return null;

  try {
    const url = `${ORS_GEOCODE_URL}?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(query)}&size=1`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("geocodeAddress: resposta não-OK do OpenRouteService", {
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const firstFeature = data?.features?.[0];
    const coordinates = firstFeature?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const [longitude, latitude] = coordinates;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return null;
    }

    return { latitude, longitude };
  } catch (error) {
    console.error("geocodeAddress: exceção ao geocodificar endereço", { error });
    return null;
  }
}

/**
 * Calcula a distância em km entre duas coordenadas usando a API de matriz de
 * distância (driving-car) do OpenRouteService.
 *
 * @returns distância em km, ou `null` se a chamada falhar ou não retornar
 * dados válidos.
 */
export async function getDistanceKm(
  origin: Coordinates,
  destination: Coordinates,
): Promise<number | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(ORS_MATRIX_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude],
        ],
        metrics: ["distance"],
      }),
    });

    if (!response.ok) {
      console.error("getDistanceKm: resposta não-OK do OpenRouteService", {
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const distanceMeters = data?.distances?.[0]?.[1];

    if (typeof distanceMeters !== "number") {
      return null;
    }

    return distanceMeters / 1000;
  } catch (error) {
    console.error("getDistanceKm: exceção ao calcular distância", { error });
    return null;
  }
}

/**
 * Fluxo completo: geocodifica o endereço do cliente e calcula a distância
 * até a loja (coordenadas já conhecidas, vindas do cadastro da loja).
 *
 * @returns distância em km, ou `null` explícito em qualquer etapa que falhe
 * (endereço não geocodificável, API indisponível) — nunca lança exceção.
 */
export async function getCustomerDistanceKm(
  storeCoordinates: Coordinates,
  customerAddress: string,
): Promise<number | null> {
  const customerCoordinates = await geocodeAddress(customerAddress);
  if (!customerCoordinates) return null;

  return getDistanceKm(storeCoordinates, customerCoordinates);
}
