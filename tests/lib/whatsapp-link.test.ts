import { describe, expect, it } from "vitest";
import { buildWhatsappOrderLink } from "@/app/lib/whatsapp-link";

/**
 * Testes da função pura que monta o link de WhatsApp do pedido (Task 5.3).
 *
 * Regra: normalizar o número da loja (remover espaços, parênteses, traços,
 * `+`) e montar a URL `wa.me` com mensagem citando o `order_number`
 * legível do pedido — nunca o `id` UUID.
 */
describe("buildWhatsappOrderLink", () => {
  it("monta o link com o número já normalizado (apenas dígitos) e o número do pedido", () => {
    const link = buildWhatsappOrderLink("11987654321", 42);

    expect(link).toContain("https://wa.me/11987654321?text=");
    expect(decodeURIComponent(link!.split("text=")[1])).toBe(
      "Olá! Gostaria de falar sobre meu pedido #42",
    );
  });

  it("remove espaços do número de entrada", () => {
    const link = buildWhatsappOrderLink("11 98765 4321", 7);
    expect(link!.startsWith("https://wa.me/11987654321?text=")).toBe(true);
  });

  it("remove parênteses e traços do número de entrada", () => {
    const link = buildWhatsappOrderLink("(11) 98765-4321", 7);
    expect(link!.startsWith("https://wa.me/11987654321?text=")).toBe(true);
  });

  it("remove o sinal de + (código de país) do número de entrada", () => {
    const link = buildWhatsappOrderLink("+55 11 98765-4321", 7);
    expect(link!.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
  });

  it("retorna null quando o número da loja é vazio", () => {
    expect(buildWhatsappOrderLink("", 1)).toBeNull();
  });

  it("retorna null quando o número da loja é apenas espaços/caracteres não numéricos", () => {
    expect(buildWhatsappOrderLink("   ", 1)).toBeNull();
  });
});
