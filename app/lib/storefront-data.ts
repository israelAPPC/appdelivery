import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase-server";
import type { Database } from "./database.types";
import type { Order } from "./orders";

/**
 * Leitura de dados públicos usados pelo storefront do cliente (PWA por loja):
 * dados da loja (vitrine/manifest) e catálogo de produtos disponíveis.
 *
 * A migration 0008_stores_public_read_policy.sql adiciona a policy
 * `stores_select_public_active` (`to anon, authenticated using (is_active
 * = true)`), que coexiste com `stores_select_own`. Por isso usamos aqui o
 * client anon (`createSupabaseServerClient()`), nunca o client admin
 * (`service_role`) — não é necessário contornar RLS para uma leitura
 * pública de dados não sensíveis (nome, slug, logo, whatsapp, loja ativa).
 */

export type StorefrontStore = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  whatsappNumber: string | null;
  isActive: boolean;
  freeRadiusKm: number | null;
  pricePerKm: number | null;
  addressLatitude: number | null;
  addressLongitude: number | null;
};

/**
 * Busca a loja pelo `slug` (rota canônica `/loja/[slug]`). Faz fallback para
 * buscar por `id` quando o valor recebido parece um UUID e a busca por slug
 * não encontra nada — cobre o período de transição em que algum client
 * antigo ainda linka pelo `id` da loja em vez do `slug`.
 *
 * Retorna `null` quando a loja não existe ou não está ativa — nunca lança
 * exceção para "não encontrado" (quem chama decide como tratar, ex.: 404).
 */
export async function getStoreBySlug(slugOrId: string): Promise<StorefrontStore | null> {
  const client = createSupabaseServerClient();

  const storeColumns =
    "id, slug, name, logo_url, whatsapp_number, is_active, free_radius_km, price_per_km, address_latitude, address_longitude";

  const bySlug = await client
    .from("stores")
    .select(storeColumns)
    .eq("slug", slugOrId)
    .maybeSingle();

  const row =
    bySlug.data ??
    (isUuid(slugOrId)
      ? (
          await client
            .from("stores")
            .select(storeColumns)
            .eq("id", slugOrId)
            .maybeSingle()
        ).data
      : null);

  if (!row || !row.is_active) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
    whatsappNumber: row.whatsapp_number,
    isActive: row.is_active,
    freeRadiusKm: row.free_radius_km,
    pricePerKm: row.price_per_km,
    addressLatitude: row.address_latitude,
    addressLongitude: row.address_longitude,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Busca um pedido para a pagina de acompanhamento do cliente final
 * (`/loja/[slug]/pedido/[orderId]`, Task 5.1).
 *
 * Nao existe login de cliente final no MVP (ver SPEC.md): o cliente e
 * identificado apenas pelo `orderId` do proprio pedido (recebido apos o
 * checkout), da mesma forma que `app/api/orders/[id]/push-subscription`.
 * `orders` nao tem policy de SELECT publica (dados do cliente/endereco), por
 * isso usamos aqui o client `service_role` — SEMPRE filtrando por `storeId`
 * explicitamente (nunca confia so no `orderId`) e retornando `null` (nunca
 * lanca excecao) quando o pedido nao existe ou pertence a outra loja.
 */
export async function getOrderForStorefront(orderId: string, storeId: string): Promise<Order | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error || !data) return null;

  return data as unknown as Order;
}

export type StorefrontProduct = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  photoUrl: string | null;
};

const MOCK_PRODUCTS: StorefrontProduct[] = [
  {
    id: "mock-1",
    name: "X-Burger Artesanal",
    price: 24.9,
    category: "Lanches",
    photoUrl: null,
  },
  {
    id: "mock-2",
    name: "Batata Frita Grande",
    price: 14.5,
    category: "Acompanhamentos",
    photoUrl: null,
  },
  {
    id: "mock-3",
    name: "Refrigerante Lata",
    price: 6.0,
    category: "Bebidas",
    photoUrl: null,
  },
];

/**
 * Lista os produtos disponíveis (`available: true`) de uma loja para a
 * vitrine pública. A policy `products_select_public_available` (migration
 * 0004) já permite leitura anônima filtrada por `available = true`, então
 * usamos o client anon aqui (nunca o admin — não é necessário).
 *
 * Se a query falhar (ex.: ambiente local sem `supabase start`/migrations
 * aplicadas ainda), cai para produtos mockados, mantendo a vitrine
 * navegável durante o desenvolvimento em paralelo da Task 2.1. Em caso de
 * erro real de query (não apenas env não configurada), o erro é logado
 * antes do fallback para não mascarar bugs de produção silenciosamente.
 */
export async function getStoreProducts(storeId: string): Promise<StorefrontProduct[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return MOCK_PRODUCTS;

  try {
    const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client
      .from("products")
      .select("id, name, price, category, photo_url")
      .eq("store_id", storeId)
      .eq("available", true)
      .order("category", { ascending: true });

    if (error || !data) {
      console.error("getStoreProducts: falha ao buscar produtos, usando fallback mockado", {
        storeId,
        error,
      });
      return MOCK_PRODUCTS;
    }

    return data.map((product) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      category: product.category,
      photoUrl: product.photo_url,
    }));
  } catch (error) {
    console.error("getStoreProducts: exceção ao buscar produtos, usando fallback mockado", {
      storeId,
      error,
    });
    return MOCK_PRODUCTS;
  }
}

export type ProductReviewSummary = {
  averageRating: number | null;
  totalReviews: number;
};

/**
 * Media de estrelas + total de avaliacoes de um produto, exibida na vitrine
 * pública (Task 5.1). `product_reviews` (migration 0014) tem policy de
 * SELECT pública (`using (true)`), por isso o client anon já pode ler
 * diretamente aqui — sem necessidade do client admin.
 *
 * Nunca lança exceção: em caso de falha de query, retorna "sem avaliações"
 * (não deve derrubar a renderização da vitrine por causa disso).
 */
export async function getProductReviewSummaries(
  productIds: string[],
): Promise<Record<string, ProductReviewSummary>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || productIds.length === 0) return {};

  try {
    const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client
      .from("product_reviews")
      .select("product_id, rating")
      .in("product_id", productIds);

    if (error || !data) {
      console.error("getProductReviewSummaries: falha ao buscar avaliações", { productIds, error });
      return {};
    }

    const grouped = data.reduce<Record<string, number[]>>((acc, review) => {
      const ratings = acc[review.product_id] ?? [];
      ratings.push(review.rating);
      acc[review.product_id] = ratings;
      return acc;
    }, {});

    return Object.fromEntries(
      Object.entries(grouped).map(([productId, ratings]) => [
        productId,
        {
          averageRating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
          totalReviews: ratings.length,
        },
      ]),
    );
  } catch (error) {
    console.error("getProductReviewSummaries: exceção ao buscar avaliações", { productIds, error });
    return {};
  }
}
