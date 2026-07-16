import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { TablesUpdate } from "@/app/lib/database.types";

/**
 * PATCH/DELETE /api/coupons/[id]
 *
 * Atualiza (ativa/desativa/edita) ou remove um cupom existente (Task 5.2).
 *
 * Ambos os verbos exigem:
 *  - Sessao valida (`getSession`).
 *  - Permissao `catalog` na loja dona do cupom (`getStorePermissions`, admin
 *    sempre liberado). Nunca confia em `storeId` vindo do client sem cruzar
 *    com o `store_id` real do cupom no banco (mesmo padrao de
 *    app/api/products/[id]/route.ts).
 */

type CouponPatchBody = {
  code?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  active?: unknown;
  expiresAt?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDiscountType(value: unknown): value is "percentage" | "fixed" | "free_shipping" {
  return value === "percentage" || value === "fixed" || value === "free_shipping";
}

async function loadCouponStoreId(
  couponId: string,
  client: ReturnType<typeof createAuthedSupabaseClient>,
): Promise<string | null> {
  const { data, error } = await client.from("coupons").select("store_id").eq("id", couponId).maybeSingle();
  if (error || !data) return null;
  return data.store_id;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const { id } = context.params;

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: CouponPatchBody;
  try {
    body = (await request.json()) as CouponPatchBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { code, discountType, discountValue, active, expiresAt } = body;

  if (discountType !== undefined && !isDiscountType(discountType)) {
    return NextResponse.json(
      { error: "Campo 'discountType' deve ser 'percentage', 'fixed' ou 'free_shipping'." },
      { status: 400 },
    );
  }

  if (discountType === "percentage" && (!isFiniteNumber(discountValue) || discountValue <= 0 || discountValue > 100)) {
    return NextResponse.json(
      { error: "Campo 'discountValue' deve estar entre 0 e 100 para cupom percentual." },
      { status: 400 },
    );
  }

  if (discountType === "fixed" && (!isFiniteNumber(discountValue) || discountValue <= 0)) {
    return NextResponse.json(
      { error: "Campo 'discountValue' deve ser maior que zero para cupom de valor fixo." },
      { status: 400 },
    );
  }

  let expiresAtValue: string | null | undefined;
  if (expiresAt !== undefined) {
    if (expiresAt === null) {
      expiresAtValue = null;
    } else if (!isNonEmptyString(expiresAt) || Number.isNaN(Date.parse(expiresAt))) {
      return NextResponse.json({ error: "Campo 'expiresAt' deve ser uma data valida." }, { status: 400 });
    } else {
      expiresAtValue = new Date(expiresAt).toISOString();
    }
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const storeId = await loadCouponStoreId(id, authedClient);
  if (!storeId) {
    return NextResponse.json({ error: "Cupom nao encontrado." }, { status: 404 });
  }

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar cupons desta loja." },
      { status: 403 },
    );
  }

  const updatePayload: TablesUpdate<"coupons"> = {};
  if (code !== undefined) {
    if (!isNonEmptyString(code)) {
      return NextResponse.json({ error: "Campo 'code' invalido." }, { status: 400 });
    }
    updatePayload.code = code.trim();
  }
  if (discountType !== undefined) {
    updatePayload.discount_type = discountType;
    updatePayload.discount_value = discountType === "free_shipping" ? null : (discountValue as number);
  } else if (discountValue !== undefined) {
    updatePayload.discount_value = isFiniteNumber(discountValue) ? discountValue : null;
  }
  if (active !== undefined) {
    updatePayload.active = active === true;
  }
  if (expiresAtValue !== undefined) {
    updatePayload.expires_at = expiresAtValue;
  }

  const { data, error } = await authedClient
    .from("coupons")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Nao foi possivel atualizar o cupom." },
      { status: 400 },
    );
  }

  return NextResponse.json({ coupon: data });
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  const { id } = context.params;

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const storeId = await loadCouponStoreId(id, authedClient);
  if (!storeId) {
    return NextResponse.json({ error: "Cupom nao encontrado." }, { status: 404 });
  }

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar cupons desta loja." },
      { status: 403 },
    );
  }

  const { error } = await authedClient.from("coupons").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Nao foi possivel remover o cupom." },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
