// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Testes do menu de navegacao do painel admin (`AdminNav`), Task de
 * menu/permissoes:
 *  - admin ve todos os links, mesmo que `permissions` esteja vazio/restritivo;
 *  - funcionario com `catalog: false` nao ve o link "Cardápio";
 *  - botao "Sair" chama o callback de logout (a limpeza real do localStorage
 *    e feita pelo layout pai, testado separadamente).
 */

const pathnameMock = vi.fn(() => "/pedidos");

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

import AdminNav from "@/app/components/admin-nav";

describe("AdminNav", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/pedidos");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("admin ve todos os links, mesmo com permissions restritivas", () => {
    render(
      <AdminNav
        role="admin"
        permissions={{ orders: false, catalog: false, financial: false, settings: false }}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Pedidos" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Cardápio" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Financeiro" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Dados da loja" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Integrações" }).length).toBeGreaterThan(0);
  });

  it("funcionario com catalog:false nao ve o link Cardápio, mas ve Pedidos", () => {
    render(
      <AdminNav
        role="employee"
        permissions={{ orders: true, catalog: false, financial: false, settings: false }}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Pedidos" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: "Cardápio" }).length).toBe(0);
    expect(screen.queryAllByRole("link", { name: "Financeiro" }).length).toBe(0);
    expect(screen.queryAllByRole("link", { name: "Dados da loja" }).length).toBe(0);
    expect(screen.queryAllByRole("link", { name: "Integrações" }).length).toBe(0);
  });

  it("funcionario com settings:true ve os dois links de configuracoes", () => {
    render(
      <AdminNav
        role="employee"
        permissions={{ orders: false, catalog: false, financial: false, settings: true }}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Dados da loja" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Integrações" }).length).toBeGreaterThan(0);
  });

  it("botao Sair chama onLogout", () => {
    const onLogout = vi.fn();
    render(
      <AdminNav
        role="admin"
        permissions={{ orders: true, catalog: true, financial: true, settings: true }}
        onLogout={onLogout}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Sair" });
    fireEvent.click(buttons[0]);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
