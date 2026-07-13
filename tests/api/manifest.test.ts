import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Testes críticos da Task 2.3 (PLAN.md):
 *  - manifest.json de loja com logo cadastrada retorna `icons` apontando
 *    para a logo correta.
 *  - loja sem logo cadastrada usa o ícone padrão do sistema (fallback),
 *    sem quebrar o manifest (sempre 200 + JSON válido).
 *
 * `getStoreBySlug` é mockado aqui porque, no momento desta task, a leitura
 * pública de `stores` depende de um client admin como stopgap (ver
 * `app/lib/storefront-data.ts`) e a coluna/policy pública ainda não está
 * finalizada pela Task 2.2 (backend-store). Quando a Task 2.2 terminar e
 * existir uma policy de leitura pública real para `stores`, este teste deve
 * ser complementado por um teste de integração real (ex.: em `tests/db/`)
 * contra o banco Supabase local, além de manter este teste unitário do
 * route handler.
 */
vi.mock("@/app/lib/storefront-data", () => ({
  getStoreBySlug: vi.fn(),
}));

import { GET } from "@/app/(storefront)/loja/[slug]/manifest.json/route";
import { getStoreBySlug } from "@/app/lib/storefront-data";

const mockedGetStoreBySlug = vi.mocked(getStoreBySlug);

describe("GET /loja/[slug]/manifest.json", () => {
  beforeEach(() => {
    mockedGetStoreBySlug.mockReset();
  });

  it("loja com logo cadastrada: icons apontam para a logo correta", async () => {
    mockedGetStoreBySlug.mockResolvedValue({
      id: "store-1",
      slug: "lanchonete-da-esquina",
      name: "Lanchonete da Esquina",
      logoUrl: "https://cdn.exemplo.com/logos/lanchonete-da-esquina.png",
      whatsappNumber: null,
      isActive: true,
    });

    const response = await GET(new Request("http://localhost/loja/lanchonete-da-esquina/manifest.json"), {
      params: { slug: "lanchonete-da-esquina" },
    });

    expect(response.status).toBe(200);
    const manifest = await response.json();

    expect(manifest.name).toBe("Lanchonete da Esquina");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src).toBe("https://cdn.exemplo.com/logos/lanchonete-da-esquina.png");
    }
  });

  it("loja sem logo cadastrada usa o ícone padrão do sistema (fallback), sem quebrar o manifest", async () => {
    mockedGetStoreBySlug.mockResolvedValue({
      id: "store-2",
      slug: "sem-logo",
      name: "Loja Sem Logo",
      logoUrl: null,
      whatsappNumber: null,
      isActive: true,
    });

    const response = await GET(new Request("http://localhost/loja/sem-logo/manifest.json"), {
      params: { slug: "sem-logo" },
    });

    expect(response.status).toBe(200);
    const manifest = await response.json();

    expect(manifest.name).toBe("Loja Sem Logo");
    for (const icon of manifest.icons) {
      expect(icon.src).toBe("/icons/default-icon.svg");
    }
  });

  it("loja inexistente (ou não encontrada) ainda retorna um manifest válido com fallback", async () => {
    mockedGetStoreBySlug.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/loja/nao-existe/manifest.json"), {
      params: { slug: "nao-existe" },
    });

    expect(response.status).toBe(200);
    const manifest = await response.json();

    expect(typeof manifest.name).toBe("string");
    for (const icon of manifest.icons) {
      expect(icon.src).toBe("/icons/default-icon.svg");
    }
  });
});
