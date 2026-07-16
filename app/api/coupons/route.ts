import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { TablesInsert } from "@/app/lib/database.types";

/**
 * GET/POST /api/coupons
 *
 * Gestao de cupons de desconto de uma loja (Task 5.2), pelo admin/painel.
 *
 * GET:
 *  - Requer sessao valida + `storeId` como query param. Retorna todos os
 *    cupons da loja (ativos e inativos) para o admin gerenciar. Nunca ha
 *    listagem publica de cupons (validacao acontece no backend do checkout,
 *    ver app/api/checkout/route.ts) — cliente final nunca ve a lista de
 *    cupons, so informa o codigo que ja conhece.
 *
 * POST:
 *  - Requer sessao valida + permissao `catalog` na loja (`getStorePermissions`).
 *    Admin sempre tem acesso, independente de `permissions` (mesmo padrao de
 *    app/api/products/route.ts).
 *  - Valida `discountType`/`discountValue` de acordo com a regra de negocio:
 *    percentage (0-100), fixed (> 0), free_shipping (discountValue ignorado).
 */

type CouponInputBody = {
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

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar cupons desta loja." },
      { status: 403 },
    );
  }

  const { data, error } = await authedClient
    .from("coupons")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/coupons][GET] Falha ao listar cupons", { storeId, error });
    return NextResponse.json({ error: "Erro interno ao listar cupons." }, { status: 500 });
  }

  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get("storeId");

  let body: CouponInputBody & { storeId?: unknown };
  try {
    body = (await request.json()) as CouponInputBody & { storeId?: unknown };
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  if (!isNonEmptyString(storeId) && isNonEmptyString(body.storeId)) {
    storeId = body.storeId;
  }

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }

  const { code, discountType, discountValue, active, expiresAt } = body;

  if (!isNonEmptyString(code)) {
    return NextResponse.json({ error: "Campo 'code' e obrigatorio." }, { status: 400 });
  }

  if (!isDiscountType(discountType)) {
    return NextResponse.json(
      { error: "Campo 'discountType' deve ser 'percentage', 'fixed' ou 'free_shipping'." },
      { status: 400 },
    );
  }

  if (discountType === "percentage") {
    if (!isFiniteNumber(discountValue) || discountValue <= 0 || discountValue > 100) {
      return NextResponse.json(
        { error: "Campo 'discountValue' e obrigatorio e deve estar entre 0 e 100 para cupom percentual." },
        { status: 400 },
      );
    }
  } else if (discountType === "fixed") {
    if (!isFiniteNumber(discountValue) || discountValue <= 0) {
      return NextResponse.json(
        { error: "Campo 'discountValue' e obrigatorio e deve ser maior que zero para cupom de valor fixo." },
        { status: 400 },
      );
    }
  }

  let expiresAtValue: string | null = null;
  if (expiresAt !== undefined && expiresAt !== null) {
    if (!isNonEmptyString(expiresAt) || Number.isNaN(Date.parse(expiresAt))) {
      return NextResponse.json({ error: "Campo 'expiresAt' deve ser uma data valida." }, { status: 400 });
    }
    expiresAtValue = new Date(expiresAt).toISOString();
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.catalog) {
    return NextResponse.json(
      { error: "Sem permissao para gerenciar cupons desta loja." },
      { status: 403 },
    );
  }

  const insertPayload: TablesInsert<"coupons"> = {
    store_id: storeId,
    code: code.trim(),
    discount_type: discountType,
    discount_value: discountType === "free_shipping" ? null : (discountValue as number),
    active: active === undefined ? true : active === true,
    expires_at: expiresAtValue,
  };

  const { data, error } = await authedClient.from("coupons").insert(insertPayload).select().single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Nao foi possivel criar o cupom." },
      { status: 400 },
    );
  }

  return NextResponse.json({ coupon: data }, { status: 201 });
}
