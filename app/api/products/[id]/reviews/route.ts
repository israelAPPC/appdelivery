import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";

/**
 * GET/POST /api/products/:id/reviews
 *
 * Avaliacoes por estrelas de um produto, pos-entrega (Task 5.1).
 *
 * Nao existe login de cliente final no MVP (ver SPEC.md) — o cliente e
 * identificado apenas pelo `orderId` do proprio pedido (mesmo padrao de
 * `app/api/orders/:id/push-subscription/route.ts`). Por isso ambas as rotas
 * usam exclusivamente o client `service_role` (`createSupabaseAdminClient`):
 * GET porque a media/lista de avaliacoes e publica (vitrine do storefront);
 * POST porque `product_reviews` (migration 0014) nao tem policy de INSERT
 * para `anon`/`authenticated` — toda a validacao de regra de negocio abaixo
 * acontece aqui no backend, nunca confiando no client.
 *
 * Regras de negocio do POST (CLAUDE.md):
 *  - So pode avaliar produto de pedido com `status = 'concluido'`.
 *  - O produto avaliado precisa estar entre os itens do pedido.
 *  - `rating` precisa ser inteiro entre 1 e 5.
 *  - Nao pode haver mais de uma avaliacao do mesmo pedido para o mesmo
 *    produto (constraint unica `order_id, product_id` no banco).
 *
 * Erro de validacao de input (ou pedido/produto invalidos) retorna sempre
 * 400, nunca 500 (seguranca.md/backend.md).
 */

const UNIQUE_VIOLATION_CODE = "23505";

type ReviewPostBody = {
  orderId?: unknown;
  rating?: unknown;
  comment?: unknown;
};

type OrderItem = {
  productId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function orderItemsIncludeProduct(items: unknown, productId: string): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((item) => (item as OrderItem)?.productId === productId);
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const productId = params.id;
  if (!isNonEmptyString(productId)) {
    return NextResponse.json({ error: "Parametro 'id' e obrigatorio." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("product_reviews")
    .select("id, rating, comment, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/products/:id/reviews][GET] Falha ao listar avaliacoes", { productId, error });
    return NextResponse.json({ error: "Nao foi possivel carregar as avaliacoes." }, { status: 400 });
  }

  const reviews = data ?? [];
  const totalReviews = reviews.length;
  const averageRating =
    totalReviews === 0 ? null : reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews;

  return NextResponse.json({ reviews, averageRating, totalReviews });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const productId = params.id;
  if (!isNonEmptyString(productId)) {
    return NextResponse.json({ error: "Parametro 'id' e obrigatorio." }, { status: 400 });
  }

  let body: ReviewPostBody;
  try {
    body = (await request.json()) as ReviewPostBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { orderId, rating, comment } = body;

  if (!isNonEmptyString(orderId)) {
    return NextResponse.json({ error: "Campo 'orderId' e obrigatorio." }, { status: 400 });
  }

  if (!isValidRating(rating)) {
    return NextResponse.json({ error: "Campo 'rating' deve ser um numero inteiro entre 1 e 5." }, { status: 400 });
  }

  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return NextResponse.json({ error: "Campo 'comment' invalido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, items")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("[api/products/:id/reviews][POST] Falha ao validar pedido", { orderId, error: orderError });
    return NextResponse.json({ error: "Nao foi possivel validar o pedido." }, { status: 400 });
  }

  if (!order) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 400 });
  }

  if (order.status !== "concluido") {
    return NextResponse.json({ error: "Este pedido ainda não foi concluído." }, { status: 400 });
  }

  if (!orderItemsIncludeProduct(order.items, productId)) {
    return NextResponse.json({ error: "Este produto não faz parte deste pedido." }, { status: 400 });
  }

  const { data: review, error: insertError } = await admin
    .from("product_reviews")
    .insert({
      product_id: productId,
      order_id: orderId,
      rating,
      comment: isNonEmptyString(comment) ? comment : null,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION_CODE) {
      return NextResponse.json({ error: "Você já avaliou este produto." }, { status: 400 });
    }

    console.error("[api/products/:id/reviews][POST] Falha ao salvar avaliacao", { orderId, productId, error: insertError });
    return NextResponse.json({ error: "Não foi possível salvar a avaliação." }, { status: 400 });
  }

  return NextResponse.json({ review }, { status: 201 });
}
