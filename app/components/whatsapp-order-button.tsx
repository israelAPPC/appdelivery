import { buildWhatsappOrderLink } from "@/app/lib/whatsapp-link";

interface WhatsappOrderButtonProps {
  storeWhatsappNumber: string | null | undefined;
  orderNumber: number;
}

/**
 * Botão para o cliente final falar com a loja pelo WhatsApp sobre um pedido
 * específico (Task 5.3). Não renderiza nada quando a loja não tem número de
 * WhatsApp cadastrado (`storeWhatsappNumber` vazio/nulo/inválido).
 */
export default function WhatsappOrderButton({
  storeWhatsappNumber,
  orderNumber,
}: WhatsappOrderButtonProps) {
  const link = buildWhatsappOrderLink(storeWhatsappNumber, orderNumber);

  if (!link) {
    return null;
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
    >
      Falar com a loja no WhatsApp
    </a>
  );
}
