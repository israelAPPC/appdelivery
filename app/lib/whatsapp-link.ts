/**
 * Monta o link `wa.me` para o cliente final contatar a loja sobre um pedido
 * (Task 5.3). Função pura: nunca faz I/O, apenas normaliza o número e
 * codifica a mensagem.
 */
export function buildWhatsappOrderLink(
  phoneNumber: string | null | undefined,
  orderNumber: number,
): string | null {
  const normalizedNumber = (phoneNumber ?? "").replace(/\D/g, "");

  if (normalizedNumber === "") {
    return null;
  }

  const message = `Olá! Gostaria de falar sobre meu pedido #${orderNumber}`;

  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`;
}
