// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("renderiza o hero com a proposta de valor principal", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/sem taxa por venda/i);
  });

  it("renderiza CTA de cadastro apontando para /cadastro", () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole("link", { name: /criar minha loja/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta.getAttribute("href")).toBe("/cadastro"));
  });

  it("renderiza link de login apontando para /login", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: /entrar/i }).getAttribute("href")).toBe("/login");
  });

  it("renderiza a secao de funcionalidades essenciais", () => {
    render(<LandingPage />);
    expect(screen.getByText(/catálogo de produtos/i)).toBeTruthy();
    expect(screen.getByText(/painel de pedidos em tempo real/i)).toBeTruthy();
    expect(screen.getByText(/frete configurável/i)).toBeTruthy();
  });

  it("renderiza a secao 'como funciona' com passos numerados", () => {
    render(<LandingPage />);
    expect(screen.getByText(/cadastre a sua loja/i)).toBeTruthy();
    expect(screen.getByText(/pedidos chegam no painel/i)).toBeTruthy();
  });

  it("nao exibe tabela de precos/planos", () => {
    render(<LandingPage />);
    expect(screen.queryByText(/r\$\s*\d/i)).toBeNull();
  });
});
