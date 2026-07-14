import "server-only";

/**
 * Cliente minimo da API do Mercado Pago Checkout Pro (Task 3.2 — checkout).
 *
 * Usa SEMPRE o `access_token` proprio da loja (lido/descriptografado de
 * `store_credentials` via `app/lib/store-credentials.ts`), nunca uma chave
 * global do app — cada loja recebe o pagamento na propria conta Mercado
 * Pago. Nunca loga o `access_token` recebido.
 */

const MERCADO_PAGO_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";

export type CreatePaymentPreferenceItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

export type CreatePaymentPreferenceInput = {
  accessToken: string;
  externalReference: string;
  items: CreatePaymentPreferenceItem[];
  notificationUrl?: string;
};

export type PaymentPreference = {
  id: string;
  initPoint: string;
};

/**
 * Cria uma preferencia de pagamento (Checkout Pro) na conta Mercado Pago da
 * loja. Lanca erro se a API do Mercado Pago responder com falha — o
 * chamador (route handler) decide como tratar (ex.: 502, sem marcar o
 * pedido como pago/falho, pois isso e responsabilidade exclusiva do
 * webhook validado, Fase 4).
 */
export async function createPaymentPreference({
  accessToken,
  externalReference,
  items,
  notificationUrl,
}: CreatePaymentPreferenceInput): Promise<PaymentPreference> {
  const response = await fetch(MERCADO_PAGO_PREFERENCES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      external_reference: externalReference,
      items: items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "BRL",
      })),
      notification_url: notificationUrl,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Falha ao criar preferencia no Mercado Pago (status ${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as { id: string; init_point: string };
  return { id: data.id, initPoint: data.init_point };
}
