import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createProduct } from "@/app/api/products/route";
import { GET as getReviews, POST as postReview } from "@/app/api/products/[id]/reviews/route";

/**
 * Testes da rota de avaliacoes de produto por estrelas (Task 5.1), contra o
 * projeto Supabase real (mesmo padrao de tests/api/checkout.test.ts).
 *
 * Nao existe login de cliente final no MVP (ver SPEC.md) — o cliente so
 * conhece o `orderId` do proprio pedido. Por isso a rota nunca exige sessao;
 * toda a validacao de regra de negocio (pedido concluido, produto pertence
 * ao pedido, nota entre 1-5, sem avaliacao duplicada) e feita no backend
 * usando o client `service_role`.
 *
 * Pre-requisito: migrations 0004_products.sql, 0009_orders.sql e
 * 0014_product_reviews.sql aplicadas no banco.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

if (!hasCredentials) {
  describe("POST/GET /api/products/:id/reviews", () => {
    it("FALHA: credenciais do Supabase ausentes em .env — teste critico nao pode ser pulado", () => {
      throw new Error(
        "tests/api/product-reviews.test.ts requer NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
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

runIfConfigured("POST/GET /api/products/:id/reviews", () => {
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
  let otherProductId: string;

  beforeAll(async () => {
    const email = `reviews-store-${suffix}@teste-app-delivery.com`;
    const signupResponse = await signup(
      jsonRequest("http://localhost/api/auth/signup", "POST", {
        email,
        password,
        store: { name: `Loja Reviews ${suffix}`, slug: `loja-reviews-${suffix}` },
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

    const productResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeId}`,
        "POST",
        { name: "Produto Avaliado", price: 15 },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );
    const productBody = (await productResponse.json()) as { product: { id: string } };
    productId = productBody.product.id;

    const otherProductResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeId}`,
        "POST",
        { name: "Produto Nao Pedido", price: 10 },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );
    const otherProductBody = (await otherProductResponse.json()) as { product: { id: string } };
    otherProductId = otherProductBody.product.id;
  }, 30000);

  afterAll(async () => {
    for (const id of storeIdsToCleanup) {
      await admin.from("orders").delete().eq("store_id", id);
      await admin.from("products").delete().eq("store_id", id);
      await admin.from("store_users").delete().eq("store_id", id);
      await admin.from("stores").delete().eq("id", id);
    }
    for (const userId of userIdsToCleanup) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function createOrder(status: "recebido" | "concluido", phone: string) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        store_id: storeId,
        customer_name: "Cliente Teste",
        customer_phone: phone,
        items: [{ productId, name: "Produto Avaliado", quantity: 1, unitPrice: 15, subtotal: 15 }],
        subtotal: 15,
        shipping_cost: 0,
        discount: 0,
        total: 15,
        payment_method: "on_delivery",
        payment_status: "pending_offline",
        fulfillment_type: "pickup",
        status,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Falha ao criar pedido de teste: ${error?.message}`);
    return data.id as string;
  }

  it("400 quando o pedido ainda nao esta concluido", async () => {
    const orderId = await createOrder("recebido", "11988880001");

    const response = await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId, rating: 5 }),
      { params: { id: productId } },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeTruthy();

    const { data } = await admin.from("product_reviews").select("id").eq("order_id", orderId);
    expect(data).toHaveLength(0);
  }, 30000);

  it("400 quando o productId nao esta entre os itens do pedido", async () => {
    const orderId = await createOrder("concluido", "11988880002");

    const response = await postReview(
      jsonRequest(`http://localhost/api/products/${otherProductId}/reviews`, "POST", { orderId, rating: 4 }),
      { params: { id: otherProductId } },
    );

    expect(response.status).toBe(400);

    const { data } = await admin.from("product_reviews").select("id").eq("order_id", orderId);
    expect(data).toHaveLength(0);
  }, 30000);

  it("400 quando rating esta fora do intervalo 1-5", async () => {
    const orderId = await createOrder("concluido", "11988880003");

    const response = await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId, rating: 6 }),
      { params: { id: productId } },
    );

    expect(response.status).toBe(400);

    const { data } = await admin.from("product_reviews").select("id").eq("order_id", orderId);
    expect(data).toHaveLength(0);
  }, 30000);

  it("cria a avaliacao quando o pedido esta concluido e o produto pertence a ele", async () => {
    const orderId = await createOrder("concluido", "11988880004");

    const response = await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", {
        orderId,
        rating: 5,
        comment: "Otimo!",
      }),
      { params: { id: productId } },
    );

    expect(response.status).toBe(201);

    const { data } = await admin.from("product_reviews").select("id, rating").eq("order_id", orderId);
    expect(data).toHaveLength(1);
    expect(data![0].rating).toBe(5);
  }, 30000);

  it("400 quando o mesmo pedido tenta avaliar o mesmo produto duas vezes", async () => {
    const orderId = await createOrder("concluido", "11988880005");

    const first = await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId, rating: 3 }),
      { params: { id: productId } },
    );
    expect(first.status).toBe(201);

    const second = await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId, rating: 4 }),
      { params: { id: productId } },
    );

    expect(second.status).toBe(400);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("Você já avaliou este produto.");

    const { data } = await admin.from("product_reviews").select("id").eq("order_id", orderId);
    expect(data).toHaveLength(1);
  }, 30000);

  it("GET retorna a lista de avaliacoes e a media recalculada corretamente", async () => {
    const orderA = await createOrder("concluido", "11988880006");
    const orderB = await createOrder("concluido", "11988880007");

    await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId: orderA, rating: 5 }),
      { params: { id: productId } },
    );
    await postReview(
      jsonRequest(`http://localhost/api/products/${productId}/reviews`, "POST", { orderId: orderB, rating: 3 }),
      { params: { id: productId } },
    );

    const response = await getReviews(new Request(`http://localhost/api/products/${productId}/reviews`), {
      params: { id: productId },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reviews: unknown[];
      averageRating: number;
      totalReviews: number;
    };
    expect(body.totalReviews).toBeGreaterThanOrEqual(2);
    expect(body.reviews.length).toBe(body.totalReviews);
    // Media deve refletir exatamente as notas inseridas para este produto.
    const sum = (body.reviews as Array<{ rating: number }>).reduce((acc, r) => acc + r.rating, 0);
    expect(body.averageRating).toBeCloseTo(sum / body.totalReviews, 5);
  }, 30000);

  it("GET de produto sem avaliacoes retorna lista vazia e media nula", async () => {
    const productResponse = await createProduct(
      jsonRequest(
        `http://localhost/api/products?storeId=${storeId}`,
        "POST",
        { name: "Produto Sem Avaliacao", price: 12 },
        { Authorization: `Bearer ${adminToken}` },
      ),
    );
    const productBody = (await productResponse.json()) as { product: { id: string } };

    const response = await getReviews(
      new Request(`http://localhost/api/products/${productBody.product.id}/reviews`),
      { params: { id: productBody.product.id } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { reviews: unknown[]; averageRating: number | null; totalReviews: number };
    expect(body.reviews).toHaveLength(0);
    expect(body.totalReviews).toBe(0);
    expect(body.averageRating).toBeNull();
  }, 30000);
});
