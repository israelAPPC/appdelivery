import { NextRequest, NextResponse } from "next/server";
import type { FulfillmentType } from "@/app/lib/calculate-shipping";
import { resolveDeliveryShipping } from "@/app/lib/delivery-shipping";
import { getStoreBySlug } from "@/app/lib/storefront-data";

/**
 * Estima o frete para um endereço de cliente, a partir do slug da loja.
 * Usa exclusivamente `resolveDeliveryShipping` (fonte única compartilhada
 * com `/api/checkout` da orquestração geocodificação -> distância ->
 * `calculateShippingCost`) — nenhuma lógica de cálculo é duplicada aqui.
 *
 * Retorna 400 para input inválido do usuário (nunca 500).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { storeSlug, address, fulfillmentType } = (body as Record<string, unknown>) ?? {};

  if (typeof storeSlug !== "string" || !storeSlug.trim()) {
    return NextResponse.json({ error: "storeSlug é obrigatório." }, { status: 400 });
  }

  const resolvedFulfillmentType: FulfillmentType = fulfillmentType === "pickup" ? "pickup" : "delivery";

  if (resolvedFulfillmentType === "delivery" && (typeof address !== "string" || !address.trim())) {
    return NextResponse.json({ error: "address é obrigatório para entrega." }, { status: 400 });
  }

  const store = await getStoreBySlug(storeSlug);
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 400 });
  }

  const result = await resolveDeliveryShipping({
    fulfillmentType: resolvedFulfillmentType,
    address: address as string | undefined,
    storeCoordinates:
      store.addressLatitude !== null && store.addressLongitude !== null
        ? { latitude: store.addressLatitude, longitude: store.addressLongitude }
        : null,
    freeRadiusKm: store.freeRadiusKm,
    pricePerKm: store.pricePerKm,
  });

  return NextResponse.json(result);
}
