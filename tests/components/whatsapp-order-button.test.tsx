// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import WhatsappOrderButton from "@/app/components/whatsapp-order-button";

/**
 * Testes do botão de WhatsApp exibido ao cliente final no pedido (Task 5.3).
 *
 * Regra: só renderiza quando a loja tem `whatsapp_number` configurado. Sem
 * número cadastrado, o botão não aparece (teste crítico do PLAN.md).
 */
describe("WhatsappOrderButton", () => {
  it("renderiza o link de WhatsApp quando a loja tem número cadastrado", () => {
    render(<WhatsappOrderButton storeWhatsappNumber="11987654321" orderNumber={42} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://wa.me/11987654321?text=" +
        encodeURIComponent("Olá! Gostaria de falar sobre meu pedido #42"),
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("não renderiza nada quando a loja não tem número de WhatsApp cadastrado", () => {
    const { container } = render(
      <WhatsappOrderButton storeWhatsappNumber={null} orderNumber={42} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada quando storeWhatsappNumber é undefined", () => {
    const { container } = render(
      <WhatsappOrderButton storeWhatsappNumber={undefined} orderNumber={42} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada quando storeWhatsappNumber é string vazia/só espaços", () => {
    const { container } = render(
      <WhatsappOrderButton storeWhatsappNumber="   " orderNumber={42} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
