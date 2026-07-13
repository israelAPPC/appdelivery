import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import type { TablesUpdate } from "@/app/lib/database.types";

/**
 * GET /api/store?storeId=<uuid>
 * PATCH /api/store
 *
 * Configuracao da loja (Task 2.2): dados cadastrais, horario de
 * funcionamento e parametros de frete (`free_radius_km`, `price_per_km`).
 *
 * Regras (CLAUDE.md / skill calculo-frete):
 *  - GET retorna os dados da propria loja do usuario autenticado (RLS de
 *    `stores` ja restringe a leitura as lojas vinculadas ao usuario).
 *  - PATCH exige sessao + permissao `settings` (admin sempre pode).
 *  - `free_radius_km` e `price_per_km`, quando informados, precisam ser
 *    numericos >= 0 — negativo e rejeitado com 400 (nunca aceito "no
 *    otimismo" e corrigido depois; nunca 500 para input invalido).
 *  - Nunca deixar a loja sem endereco valido: PATCH nao permite limpar
 *    `address_street`/`address_city` para vazio quando a loja ja possui
 *    frete/entrega configurados (impede loja "sem endereco" com calculo de
 *    frete quebrado).
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Numero finito e >= 0, ou `null` explicito (campo "nao configurado"). */
function isValidNonNegativeNumberOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

type StorePatchBody = {
  storeId?: unknown;
  name?: unknown;
  address_street?: unknown;
  address_number?: unknown;
  address_neighborhood?: unknown;
  address_city?: unknown;
  address_state?: unknown;
  address_zip_code?: unknown;
  address_latitude?: unknown;
  address_longitude?: unknown;
  phone?: unknown;
  whatsapp_number?: unknown;
  opening_hours?: unknown;
  free_radius_km?: unknown;
  price_per_km?: unknown;
};

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  // RLS (`stores_select_own`) ja garante que so retorna se o usuario estiver
  // vinculado a loja — nao ha necessidade de checar permissao especifica
  // para leitura (todo membro da loja pode ver os dados dela).
  const { data: store, error } = await authedClient
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    console.error("[api/store] Falha ao buscar loja", { storeId, error });
    return NextResponse.json({ error: "Erro interno ao buscar a loja." }, { status: 500 });
  }

  if (!store) {
    return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
  }

  return NextResponse.json({ store });
}

export async function PATCH(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: StorePatchBody;
  try {
    body = (await request.json()) as StorePatchBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { storeId } = body;
  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  // Apenas admin ou funcionario com permissao 'settings' pode alterar a
  // configuracao da loja — checagem sempre no backend (nunca so no frontend).
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.settings) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para alterar a configuracao desta loja." },
      { status: 403 },
    );
  }

  // Nunca aceitar free_radius_km/price_per_km negativos (CLAUDE.md / skill
  // calculo-frete). `undefined` = campo nao enviado (nao altera); `null` =
  // "nao configurado" explicito; numero negativo = rejeitado com 400.
  if (body.free_radius_km !== undefined && !isValidNonNegativeNumberOrNull(body.free_radius_km)) {
    return NextResponse.json(
      { error: "Campo 'free_radius_km' deve ser um numero maior ou igual a zero, ou null." },
      { status: 400 },
    );
  }
  if (body.price_per_km !== undefined && !isValidNonNegativeNumberOrNull(body.price_per_km)) {
    return NextResponse.json(
      { error: "Campo 'price_per_km' deve ser um numero maior ou igual a zero, ou null." },
      { status: 400 },
    );
  }

  // Nunca deixar a loja sem endereco valido (necessario para o calculo de
  // frete funcionar) — se o client tentar limpar o endereco (string vazia),
  // rejeita com 400 em vez de aceitar e quebrar o frete silenciosamente.
  const addressFieldsBeingCleared = [
    body.address_street,
    body.address_city,
  ].some((value) => typeof value === "string" && value.trim().length === 0);

  if (addressFieldsBeingCleared) {
    return NextResponse.json(
      { error: "Endereco da loja (rua e cidade) nao pode ficar vazio." },
      { status: 400 },
    );
  }

  const update: TablesUpdate<"stores"> = {};
  const asNullableString = (value: unknown): string | null | undefined =>
    value === undefined ? undefined : typeof value === "string" ? value : null;
  const asNullableNumber = (value: unknown): number | null | undefined =>
    value === undefined ? undefined : typeof value === "number" ? value : null;

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: "Campo 'name' nao pode ser vazio." }, { status: 400 });
    }
    update.name = body.name;
  }
  if (body.address_street !== undefined) update.address_street = asNullableString(body.address_street);
  if (body.address_number !== undefined) update.address_number = asNullableString(body.address_number);
  if (body.address_neighborhood !== undefined)
    update.address_neighborhood = asNullableString(body.address_neighborhood);
  if (body.address_city !== undefined) update.address_city = asNullableString(body.address_city);
  if (body.address_state !== undefined) update.address_state = asNullableString(body.address_state);
  if (body.address_zip_code !== undefined) update.address_zip_code = asNullableString(body.address_zip_code);
  if (body.address_latitude !== undefined) update.address_latitude = asNullableNumber(body.address_latitude);
  if (body.address_longitude !== undefined)
    update.address_longitude = asNullableNumber(body.address_longitude);
  if (body.phone !== undefined) update.phone = asNullableString(body.phone);
  if (body.whatsapp_number !== undefined) update.whatsapp_number = asNullableString(body.whatsapp_number);
  if (body.opening_hours !== undefined) update.opening_hours = body.opening_hours as never;
  if (body.free_radius_km !== undefined) update.free_radius_km = body.free_radius_km as number | null;
  if (body.price_per_km !== undefined) update.price_per_km = body.price_per_km as number | null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar foi informado." }, { status: 400 });
  }

  const { data: updated, error } = await authedClient
    .from("stores")
    .update(update)
    .eq("id", storeId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[api/store] Falha ao atualizar loja", { storeId, error });
    return NextResponse.json({ error: "Erro interno ao atualizar a loja." }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
  }

  return NextResponse.json({ store: updated });
}
