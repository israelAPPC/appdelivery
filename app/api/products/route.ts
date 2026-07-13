import { NextResponse } from "next/server";
import {
  createAnonSupabaseClient,
  createAuthedSupabaseClient,
  getSession,
  getStorePermissions,
} from "@/app/lib/auth";
import type { TablesInsert } from "@/app/lib/database.types";

/**
 * GET/POST /api/products
 *
 * Catalogo de produtos de uma loja (Task 2.1 — CRUD de produtos e catalogo).
 *
 * GET:
 *  - Requer `storeId` como query param.
 *  - Se o caller estiver autenticado e vinculado aquela loja (`store_users`),
 *    retorna TODOS os produtos da loja (incluindo indisponiveis) — uso do
 *    painel admin/catalogo.
 *  - Caso contrario (sem sessao, ou sessao sem vinculo com a loja), retorna
 *    apenas produtos com `available: true` — vitrine publica do storefront.
 *    Nunca expoe produto indisponivel nesse caso (regra CLAUDE.md).
 *
 * POST:
 *  - Requer sessao valida + permissao `catalog` na loja (`getStorePermissions`).
 *    Admin sempre tem acesso, independente de `permissions`.
 *  - Preco deve ser > 0 — validado aqui no backend, nunca confia no client;
 *    rejeitado com 400 (nunca 500). Constraint equivalente existe no banco
 *    (defesa em profundidade, migration 0004_products.sql).
 */

type ProductInputBody = {
  name?: unknown;
  price?: unknown;
  category?: unknown;
  photoUrl?: unknown;
  available?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  const session = await getSession(request);

  if (session) {
    const authedClient = createAuthedSupabaseClient(session.accessToken);
    const access = await getStorePermissions(session.user.id, storeId, authedClient);

    if (access) {
      // Usuario vinculado a loja (dono/funcionario): ve TODOS os produtos.
      const { data, error } = await authedClient
        .from("products")
        .select("*")
        .eq("store_id", storeId)
        .order("name", { ascending: true });

      if (error) {
        console.error("[api/products][GET] Falha ao listar produtos (gestao)", { storeId, error });
        return NextResponse.json({ error: "Erro interno ao listar produtos." }, { status: 500 });
      }

      return NextResponse.json({ products: data ?? [] });
    }
  }

  // Sem sessao, ou sessao sem vinculo com a loja: listagem publica, apenas
  // produtos disponiveis (nunca expoe `available: false`).
  const anonClient = createAnonSupabaseClient();
  const { data, error } = await anonClient
    .from("products")
    .select("*")
    .eq("store_id", storeId)
    .eq("available", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[api/products][GET] Falha ao listar produtos (publico)", { storeId, error });
    return NextResponse.json({ error: "Erro interno ao listar produtos." }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get("storeId");

  let body: ProductInputBody & { storeId?: unknown };
  try {
    body = (await request.json()) as ProductInputBody & { storeId?: unknown };
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  if (!isNonEmptyString(storeId) && isNonEmptyString(body.storeId)) {
    storeId = body.storeId;
  }

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }

  const { name, price, category, photoUrl, available } = body;

  if (!isNonEmptyString(name)) {
    return NextResponse.json({ error: "Campo 'name' e obrigatorio." }, { status: 400 });
  }

  if (!isFiniteNumber(price) || price <= 0) {
    return NextResponse.json(
      { error: "Campo 'price' e obrigatorio e deve ser um numero maior que zero." },
      { status: 400 },
    );
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  // Apenas usuario com permissao 'catalog' (ou admin, sempre liberado) pode
  // criar produto. Checagem sempre no backend, nunca confiando no frontend.
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar o catalogo desta loja." },
      { status: 403 },
    );
  }

  const insertPayload: TablesInsert<"products"> = {
    store_id: storeId,
    name: name.trim(),
    price,
    category: isNonEmptyString(category) ? category : null,
    photo_url: isNonEmptyString(photoUrl) ? photoUrl : null,
    available: available === undefined ? true : available === true,
  };

  const { data, error } = await authedClient.from("products").insert(insertPayload).select().single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Nao foi possivel criar o produto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
