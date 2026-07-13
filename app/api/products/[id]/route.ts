import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { TablesUpdate } from "@/app/lib/database.types";

/**
 * PATCH/DELETE /api/products/[id]
 *
 * Atualiza ou remove um produto existente (Task 2.1).
 *
 * Ambos os verbos exigem:
 *  - Sessao valida (`getSession`).
 *  - Permissao `catalog` na loja dona do produto (`getStorePermissions`,
 *    admin sempre liberado). Nunca confia em `storeId` vindo do client sem
 *    cruzar com o `store_id` real do produto no banco.
 *
 * PATCH tambem valida `price` (> 0) quando informado, exatamente como o
 * POST de criacao — nunca aceita preco zero/negativo (400, nunca 500).
 */

type ProductPatchBody = {
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

async function loadProductStoreId(
  productId: string,
  client: ReturnType<typeof createAuthedSupabaseClient>,
): Promise<string | null> {
  const { data, error } = await client.from("products").select("store_id").eq("id", productId).maybeSingle();
  if (error || !data) return null;
  return data.store_id;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const { id } = context.params;

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: ProductPatchBody;
  try {
    body = (await request.json()) as ProductPatchBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { name, price, category, photoUrl, available } = body;

  if (price !== undefined && (!isFiniteNumber(price) || price <= 0)) {
    return NextResponse.json(
      { error: "Campo 'price' deve ser um numero maior que zero." },
      { status: 400 },
    );
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  // RLS ja restringe leitura/escrita a produtos da(s) propria(s) loja(s) do
  // usuario, mas buscamos o store_id real do produto para checar a
  // permissao 'catalog' explicitamente (defesa em profundidade).
  const storeId = await loadProductStoreId(id, authedClient);
  if (!storeId) {
    return NextResponse.json({ error: "Produto nao encontrado." }, { status: 404 });
  }

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar o catalogo desta loja." },
      { status: 403 },
    );
  }

  const updatePayload: TablesUpdate<"products"> = {};
  if (name !== undefined) {
    if (!isNonEmptyString(name)) {
      return NextResponse.json({ error: "Campo 'name' invalido." }, { status: 400 });
    }
    updatePayload.name = name.trim();
  }
  if (price !== undefined) {
    updatePayload.price = price as number;
  }
  if (category !== undefined) {
    updatePayload.category = isNonEmptyString(category) ? category : null;
  }
  if (photoUrl !== undefined) {
    updatePayload.photo_url = isNonEmptyString(photoUrl) ? photoUrl : null;
  }
  if (available !== undefined) {
    updatePayload.available = available === true;
  }

  const { data, error } = await authedClient
    .from("products")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Nao foi possivel atualizar o produto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ product: data });
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  const { id } = context.params;

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const storeId = await loadProductStoreId(id, authedClient);
  if (!storeId) {
    return NextResponse.json({ error: "Produto nao encontrado." }, { status: 404 });
  }

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar o catalogo desta loja." },
      { status: 403 },
    );
  }

  const { error } = await authedClient.from("products").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Nao foi possivel remover o produto." },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
