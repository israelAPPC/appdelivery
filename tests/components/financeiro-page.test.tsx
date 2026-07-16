// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Testes da tela de relatorio financeiro (`app/(admin)/financeiro/page.tsx`),
 * Task 5.4. Mesmo padrao de tests/components/configuracoes-loja-page.test.tsx:
 * sessao via localStorage, `fetch` global mockado, sem chamada real a
 * rede/Supabase.
 */

const STORE_ID = "33333333-3333-3333-3333-333333333333";

describe("FinanceiroPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("carrega e exibe o total vendido e a segmentacao por forma de pagamento", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/reports/sales?")) {
          return new Response(
            JSON.stringify({
              total: 200,
              byPaymentMethod: { mp_online: 150.75, on_delivery: 49.25 },
              ordersCount: 3,
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { default: FinanceiroPage } = await import("@/app/(admin)/financeiro/page");
    render(<FinanceiroPage />);

    await waitFor(() => expect(screen.getByText(/200/)).toBeTruthy());
    expect(screen.getByText(/150,75|150\.75/)).toBeTruthy();
    expect(screen.getByText(/49,25|49\.25/)).toBeTruthy();
  });

  it("mostra mensagem de sessao ausente quando nao ha storeId/accessToken", async () => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());

    const { default: FinanceiroPage } = await import("@/app/(admin)/financeiro/page");
    render(<FinanceiroPage />);

    expect(screen.getByText(/sessão da loja não encontrada/i)).toBeTruthy();
  });

  it("mostra erro quando a API rejeita a requisicao", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/reports/sales?")) {
          return new Response(JSON.stringify({ error: "Nao foi possivel carregar o relatorio financeiro." }), {
            status: 500,
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { default: FinanceiroPage } = await import("@/app/(admin)/financeiro/page");
    render(<FinanceiroPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/nao foi possivel carregar o relatorio financeiro/i);
  });
});
