// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Testes de `app/lib/admin-session-context.tsx` (`AdminSessionProvider` +
 * `useAdminSession`):
 *  - sem sessao (storeId/accessToken ausentes) -> redireciona para /login;
 *  - com sessao completa -> useAdminSession() retorna storeId/role/permissions
 *    corretos, parseados do localStorage;
 *  - logout() limpa os 5 itens do localStorage e redireciona para /login.
 */

const pushMock = vi.fn();
// Objeto estavel: o mock de `useRouter` do Next real retorna a MESMA
// referencia entre renders. Se recriassemos `{ push: pushMock }` a cada
// chamada, o `useEffect` de `AdminSessionProvider` (que depende de `router`)
// dispararia infinitamente a cada re-render.
const routerMock = { push: pushMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const STORE_ID = "44444444-4444-4444-4444-444444444444";

describe("AdminSessionProvider / useAdminSession", () => {
  beforeEach(() => {
    pushMock.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.resetModules();
  });

  it("sem sessao (storeId/accessToken ausentes): redireciona para /login", async () => {
    const { AdminSessionProvider } = await import("@/app/lib/admin-session-context");

    render(
      <AdminSessionProvider>
        <div>conteudo protegido</div>
      </AdminSessionProvider>,
    );

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("conteudo protegido")).toBeNull();
  });

  it("com sessao completa: useAdminSession() retorna storeId/role/permissions corretos", async () => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
    window.localStorage.setItem("app_delivery_refresh_token", "refresh-abc");
    window.localStorage.setItem("app_delivery_role", "employee");
    window.localStorage.setItem(
      "app_delivery_permissions",
      JSON.stringify({ orders: true, catalog: false, financial: false, settings: true }),
    );

    const { AdminSessionProvider, useAdminSession } = await import("@/app/lib/admin-session-context");

    function Probe() {
      const session = useAdminSession();
      return (
        <div>
          <span data-testid="store-id">{session.storeId}</span>
          <span data-testid="access-token">{session.accessToken}</span>
          <span data-testid="role">{session.role}</span>
          <span data-testid="permissions">{JSON.stringify(session.permissions)}</span>
        </div>
      );
    }

    render(
      <AdminSessionProvider>
        <Probe />
      </AdminSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("store-id").textContent).toBe(STORE_ID));
    expect(screen.getByTestId("access-token").textContent).toBe("token-abc");
    expect(screen.getByTestId("role").textContent).toBe("employee");
    expect(screen.getByTestId("permissions").textContent).toBe(
      JSON.stringify({ orders: true, catalog: false, financial: false, settings: true }),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("logout() limpa os 5 itens do localStorage e redireciona para /login", async () => {
    window.localStorage.setItem("app_delivery_store_id", STORE_ID);
    window.localStorage.setItem("app_delivery_access_token", "token-abc");
    window.localStorage.setItem("app_delivery_refresh_token", "refresh-abc");
    window.localStorage.setItem("app_delivery_role", "admin");
    window.localStorage.setItem("app_delivery_permissions", JSON.stringify({}));

    const { AdminSessionProvider, useAdminSession } = await import("@/app/lib/admin-session-context");

    function Probe() {
      const session = useAdminSession();
      return (
        <button type="button" onClick={session.logout}>
          Sair
        </button>
      );
    }

    render(
      <AdminSessionProvider>
        <Probe />
      </AdminSessionProvider>,
    );

    const button = await screen.findByRole("button", { name: "Sair" });
    button.click();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
    expect(window.localStorage.getItem("app_delivery_store_id")).toBeNull();
    expect(window.localStorage.getItem("app_delivery_access_token")).toBeNull();
    expect(window.localStorage.getItem("app_delivery_refresh_token")).toBeNull();
    expect(window.localStorage.getItem("app_delivery_role")).toBeNull();
    expect(window.localStorage.getItem("app_delivery_permissions")).toBeNull();
  });

  it("useAdminSession() fora do Provider lanca erro claro", async () => {
    const { useAdminSession } = await import("@/app/lib/admin-session-context");

    function Broken() {
      useAdminSession();
      return null;
    }

    const originalError = console.error;
    console.error = vi.fn();
    expect(() => render(<Broken />)).toThrow(/AdminSessionProvider/);
    console.error = originalError;
  });
});
