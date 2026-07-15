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

export type MercadoPagoPayment = {
  id: string;
  status: string;
  externalReference: string | null;
};

/**
 * Busca um pagamento na API do Mercado Pago usando o `access_token` PROPRIO
 * da loja (Task 4.1 — webhook de confirmacao de pagamento).
 *
 * Este e o mecanismo real de "validacao de autenticidade" do webhook: o
 * corpo da notificacao recebida do Mercado Pago NUNCA e confiavel por si so
 * (qualquer um pode enviar um POST para a URL do webhook forjando o payload)
 * — so quem possui o access_token verdadeiro da loja consegue ler os dados
 * reais do pagamento aqui. Por isso o chamador (route handler do webhook)
 * deve usar APENAS `data.id` do corpo recebido para saber qual pagamento
 * buscar, e usar o resultado desta funcao (nunca o corpo do webhook) para
 * decidir o que fazer com o pedido.
 */
export async function getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Falha ao buscar pagamento no Mercado Pago (status ${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as { id: number | string; status: string; external_reference: string | null };
  return { id: String(data.id), status: data.status, externalReference: data.external_reference ?? null };
}
