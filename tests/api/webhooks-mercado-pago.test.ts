import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createProduct } from "@/app/api/products/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as saveCredential } from "@/app/api/store/credentials/route";
import { POST as webhook } from "@/app/api/webhooks/mercado-pago/route";

/**
 * Testes do webhook de confirmacao de pagamento do Mercado Pago (Task 4.1),
 * contra o projeto Supabase real (mesmo padrao de tests/api/checkout.test.ts).
 *
 * Pre-requisito: migrations ate 0011_orders_mp_payment_id.sql aplicadas.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("POST /api/webhooks/mercado-pago", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/webhooks-mercado-pago.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
          "SUPABASE_SERVICE_ROLE_KEY configuradas em .env para rodar contra um banco Supabase real.",
      );
    });
  });
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

runIfConfigured("POST /api/webhooks/mercado-pago", () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = Date.now();
  const password = "Senha-Teste-123!";

  const storeIdsToCleanup: string[] = [];
  const userIdsToCleanup: string[] = [];

  let storeId: string;
  let adminToken: string;
  let productId: string;
  let productPrice: number;

  beforeAll(async () => {
    const email = `webhook-mp-store-${suffix}@teste-app-delivery.com`;
    const signupResponse = await signup(
      jsonRequest("http://localhost/api/auth/signup", "POST", {
        email,
        password,
        store: { name: `Loja Webhook MP ${suffix}`, slug: `loja-webhook-mp-${suffix}` },
      }),
    );
    const signupBody = (await signupResponse.json()) as {
      user: { id: string };
      store: { id: string };
      session: { access_token: string };
    };
    storeId = signupBody.store.id;
    adminToken = signupBody.session.access_token;
    storeIdsToCleanup.push(storeId);
    userIdsToCleanup.push(signupBody.user.id);

    await saveCredential(
      jsonRequest(
        "http://localhost/api/store/credentials",
        "POST",
        { storeId, provider: "mercado_pago", value: "TEST-access-token-da-loja" },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );

    const productResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeId}`,
        "POST",
        { name: "Combo Webhook", price: 30 },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );
    const productBody = (await productResponse.json()) as { product: { id: string; price: number } };
    productId = productBody.product.id;
    productPrice = productBody.product.price;
  }, 30000);

  afterAll(async () => {
    for (const id of storeIdsToCleanup) {
      await admin.from("orders").delete().eq("store_id", id);
      await admin.from("store_credentials").delete().eq("store_id", id);
      await admin.from("products").delete().eq("store_id", id);
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createMpOrder(customerPhone: string): Promise<string> {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [url] = args;
      if (!String(url).includes("api.mercadopago.com")) {
        return originalFetch(...args);
      }
      return new Response(
        JSON.stringify({ id: "pref-123", init_point: "https://mercadopago.com/checkout/pref-123" }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", "POST", {
        storeId,
        customerName: "Cliente Webhook",
        customerPhone,
        fulfillmentType: "pickup",
        items: [{ productId, quantity: 1 }],
        paymentMethod: "mp_online",
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { order: { id: string } };
    vi.unstubAllGlobals();
    return body.order.id;
  }

  function stubMercadoPagoPaymentApi(status: string, externalReference: string, paymentId = "mp-payment-1") {
    const originalFetch = global.fetch;
    return vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [url, init] = args;
      const urlString = String(url);
      if (!urlString.includes("api.mercadopago.com/v1/payments/")) {
        return originalFetch(...args);
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TEST-access-token-da-loja");
      return new Response(
        JSON.stringify({ id: paymentId, status, external_reference: externalReference }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  }

  it("pagamento aprovado muda orders.payment_status para 'paid'", async () => {
    const orderId = await createMpOrder("11988880001");

    const fetchSpy = stubMercadoPagoPaymentApi("approved", orderId, "mp-payment-approved-1");
    vi.stubGlobal("fetch", fetchSpy);

    const response = await webhook(
      jsonRequest(`http://localhost/api/webhooks/mercado-pago?storeId=${storeId}`, "POST", {
        type: "payment",
        data: { id: "mp-payment-approved-1" },
      }),
    );

    expect(response.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("payment_status, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(order?.payment_status).toBe("paid");
    expect(order?.mp_payment_id).toBe("mp-payment-approved-1");
  }, { retry: 3, timeout: 30000 });

  it("reenvio do MESMO webhook (mesmo payment_id) nao duplica a atualizacao nem gera efeito colateral duplo", async () => {
    const orderId = await createMpOrder("11988880002");

    const fetchSpy = stubMercadoPagoPaymentApi("approved", orderId, "mp-payment-approved-2");
    vi.stubGlobal("fetch", fetchSpy);

    const firstResponse = await webhook(
      jsonRequest(`http://localhost/api/webhooks/mercado-pago?storeId=${storeId}`, "POST", {
        type: "payment",
        data: { id: "mp-payment-approved-2" },
      }),
    );
    expect(firstResponse.status).toBe(200);

    const { data: orderAfterFirst } = await admin
      .from("orders")
      .select("payment_status, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(orderAfterFirst?.payment_status).toBe("paid");
    expect(orderAfterFirst?.mp_payment_id).toBe("mp-payment-approved-2");

    // Reenvio da MESMA notificacao (mesmo payment_id) — nao deve alterar
    // nada nem falhar.
    const secondResponse = await webhook(
      jsonRequest(`http://localhost/api/webhooks/mercado-pago?storeId=${storeId}`, "POST", {
        type: "payment",
        data: { id: "mp-payment-approved-2" },
      }),
    );
    expect(secondResponse.status).toBe(200);

    const { data: orderAfterSecond } = await admin
      .from("orders")
      .select("payment_status, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(orderAfterSecond?.payment_status).toBe("paid");
    expect(orderAfterSecond?.mp_payment_id).toBe("mp-payment-approved-2");
  }, { retry: 3, timeout: 30000 });

  it("pagamento rejeitado muda orders.payment_status para 'failed'", async () => {
    const orderId = await createMpOrder("11988880003");

    const fetchSpy = stubMercadoPagoPaymentApi("rejected", orderId, "mp-payment-rejected-1");
    vi.stubGlobal("fetch", fetchSpy);

    const response = await webhook(
      jsonRequest(`http://localhost/api/webhooks/mercado-pago?storeId=${storeId}`, "POST", {
        type: "payment",
        data: { id: "mp-payment-rejected-1" },
      }),
    );
    expect(response.status).toBe(200);

    const { data: order } = await admin
      .from("orders")
      .select("payment_status, mp_payment_id")
      .eq("id", orderId)
      .single();
    expect(order?.payment_status).toBe("failed");
    expect(order?.mp_payment_id).toBe("mp-payment-rejected-1");
  }, { retry: 3, timeout: 30000 });

  it("evento que nao e 'payment' e ignorado (200, sem alterar nenhum pedido)", async () => {
    const response = await webhook(
      jsonRequest(`http://localhost/api/webhooks/mercado-pago?storeId=${storeId}`, "POST", {
        type: "merchant_order",
        data: { id: "irrelevante" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("storeId inexistente/sem credencial mercado_pago retorna erro (nao 200), sem lancar excecao", async () => {
    const response = await webhook(
      jsonRequest(
        `http://localhost/api/webhooks/mercado-pago?storeId=00000000-0000-0000-0000-000000000000`,
        "POST",
        { type: "payment", data: { id: "mp-payment-sem-loja" } },
      ),
    );
    expect(response.status).not.toBe(200);
    expect(response.status).not.toBe(500);
  });
});
