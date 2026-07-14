import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Testes do endpoint de estimativa de frete. `getStoreBySlug` e
 * `getCustomerDistanceKm` são mockados (I/O: banco e API externa) — o
 * cálculo do valor de frete em si (`calculateShippingCost`) NÃO é mockado,
 * é a função real (skill calculo-frete: nunca mockar regra pura de cálculo).
 */

const getStoreBySlugMock = vi.fn();
const getCustomerDistanceKmMock = vi.fn();

vi.mock("@/app/lib/storefront-data", () => ({
  getStoreBySlug: getStoreBySlugMock,
}));

vi.mock("@/app/lib/geocode-distance", () => ({
  getCustomerDistanceKm: getCustomerDistanceKmMock,
}));

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/shipping/estimate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const baseStore = {
  id: "store-1",
  slug: "loja-teste",
  name: "Loja Teste",
  logoUrl: null,
  whatsappNumber: null,
  isActive: true,
  freeRadiusKm: 5,
  pricePerKm: 2,
  addressLatitude: -23.55,
  addressLongitude: -46.63,
};

describe("POST /api/shipping/estimate", () => {
  beforeEach(() => {
    getStoreBySlugMock.mockReset();
    getCustomerDistanceKmMock.mockReset();
  });

  it("endereço dentro do raio grátis retorna frete 0", async () => {
    getStoreBySlugMock.mockResolvedValue(baseStore);
    getCustomerDistanceKmMock.mockResolvedValue(3);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-teste", address: "Rua A, 1" }));
    const json = await response.json();

    expect(json).toEqual({ shippingCost: 0, distanceKm: 3 });
  });

  it("endereço fora do raio grátis retorna o valor calculado pela função real", async () => {
    getStoreBySlugMock.mockResolvedValue(baseStore);
    getCustomerDistanceKmMock.mockResolvedValue(8);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-teste", address: "Rua B, 2" }));
    const json = await response.json();

    // (8 - 5) * 2 = 6, calculado por calculateShippingCost (não mockado)
    expect(json).toEqual({ shippingCost: 6, distanceKm: 8 });
  });

  it("distância não calculável (geocodificação falhou) retorna shippingCost null com mensagem, não NaN/grátis", async () => {
    getStoreBySlugMock.mockResolvedValue(baseStore);
    getCustomerDistanceKmMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-teste", address: "endereço inválido" }));
    const json = await response.json();

    expect(json.shippingCost).toBeNull();
    expect(typeof json.error).toBe("string");
  });

  it("fora do raio sem price_per_km configurado retorna shippingCost null (frete indisponível)", async () => {
    getStoreBySlugMock.mockResolvedValue({ ...baseStore, pricePerKm: null });
    getCustomerDistanceKmMock.mockResolvedValue(8);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-teste", address: "Rua C, 3" }));
    const json = await response.json();

    expect(json.shippingCost).toBeNull();
  });

  it("fulfillmentType pickup nunca calcula frete, retorna 0 sem geocodificar", async () => {
    getStoreBySlugMock.mockResolvedValue(baseStore);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-teste", fulfillmentType: "pickup" }));
    const json = await response.json();

    expect(json).toEqual({ shippingCost: 0, distanceKm: 0 });
    expect(getCustomerDistanceKmMock).not.toHaveBeenCalled();
  });

  it("storeSlug ausente retorna 400, nunca 500", async () => {
    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ address: "Rua A, 1" }));

    expect(response.status).toBe(400);
  });

  it("loja não encontrada retorna 400, nunca 500", async () => {
    getStoreBySlugMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/shipping/estimate/route");
    const response = await POST(buildRequest({ storeSlug: "loja-inexistente", address: "Rua A, 1" }));

    expect(response.status).toBe(400);
  });
});
