import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, getCustomerDistanceKm, getDistanceKm } from "@/app/lib/geocode-distance";

/**
 * Testes do integrador com OpenRouteService (geocodificação + distância).
 * Diferente de `calculate-shipping.test.ts` (regra pura, sem mock), aqui o
 * `fetch` é mockado por ser uma chamada de rede a uma API externa — a
 * geocodificação em si não é a regra de negócio de frete.
 */
describe("geocode-distance", () => {
  const originalEnv = process.env.OPENROUTESERVICE_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENROUTESERVICE_API_KEY = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("geocodeAddress retorna coordenadas do primeiro resultado", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [-46.63, -23.55] } }],
      }),
    }) as unknown as typeof fetch;

    const result = await geocodeAddress("Av. Paulista, 1000, São Paulo");
    expect(result).toEqual({ latitude: -23.55, longitude: -46.63 });
  });

  it("geocodeAddress retorna null quando não há resultado (nunca lança exceção)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }) as unknown as typeof fetch;

    const result = await geocodeAddress("endereço inexistente");
    expect(result).toBeNull();
  });

  it("geocodeAddress retorna null quando a API falha (status não-OK), sem quebrar", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const result = await geocodeAddress("endereço qualquer");
    expect(result).toBeNull();
  });

  it("geocodeAddress retorna null sem lançar quando a chave não está configurada", async () => {
    delete process.env.OPENROUTESERVICE_API_KEY;
    global.fetch = vi.fn();

    const result = await geocodeAddress("endereço qualquer");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("getDistanceKm converte metros retornados pela matriz para km", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distances: [[0, 8000]] }),
    }) as unknown as typeof fetch;

    const result = await getDistanceKm(
      { latitude: -23.55, longitude: -46.63 },
      { latitude: -23.6, longitude: -46.7 },
    );
    expect(result).toBe(8);
  });

  it("getCustomerDistanceKm retorna null quando o endereço não é geocodificável, sem quebrar o fluxo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }) as unknown as typeof fetch;

    const result = await getCustomerDistanceKm(
      { latitude: -23.55, longitude: -46.63 },
      "endereço inexistente",
    );
    expect(result).toBeNull();
  });

  it("getCustomerDistanceKm encadeia geocodificação + distância corretamente", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [{ geometry: { coordinates: [-46.7, -23.6] } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ distances: [[0, 3000]] }),
      }) as unknown as typeof fetch;

    const result = await getCustomerDistanceKm(
      { latitude: -23.55, longitude: -46.63 },
      "Rua Exemplo, 100",
    );
    expect(result).toBe(3);
  });
});
