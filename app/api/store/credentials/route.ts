import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";
import { getStoreCredentialStatus, isValidProvider, upsertStoreCredential } from "@/app/lib/store-credentials";

/**
 * GET /api/store/credentials?storeId=<uuid>&provider=<mercado_pago|whatsapp>
 * POST /api/store/credentials
 *
 * Central de credenciais de integracao da loja (Task 2.4).
 *
 * Regras (CLAUDE.md / regras/seguranca.md):
 *  - Valor da credencial NUNCA e persistido em texto plano nem retornado
 *    por nenhuma rota GET — o backend so expoe `{ configured, last4 }`.
 *  - Exige sessao + permissao `settings` (admin sempre pode) para
 *    ler/escrever, checado no backend, nunca so no frontend. A RLS de
 *    `store_credentials` (`has_store_settings_permission`) e a ultima
 *    linha de defesa.
 *  - O valor real fica no Supabase Vault (app/lib/store-credentials.ts),
 *    nunca em uma coluna normal da tabela.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type SettingsAccessResult =
  | { error: NextResponse }
  | {
      session: Awaited<ReturnType<typeof getSession>> & object;
      authedClient: ReturnType<typeof createAuthedSupabaseClient>;
      access: NonNullable<Awaited<ReturnType<typeof getStorePermissions>>>;
    };

async function requireSettingsAccess(request: Request, storeId: string): Promise<SettingsAccessResult> {
  const session = await getSession(request);
  if (!session) {
    return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.settings) {
    return {
      error: NextResponse.json(
        { error: "Voce nao tem permissao para gerenciar as integracoes desta loja." },
        { status: 403 },
      ),
    };
  }

  return { session, authedClient, access };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  const provider = url.searchParams.get("provider");

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Parametro 'storeId' e obrigatorio." }, { status: 400 });
  }
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { error: "Parametro 'provider' e obrigatorio e deve ser 'mercado_pago' ou 'whatsapp'." },
      { status: 400 },
    );
  }

  const access = await requireSettingsAccess(request, storeId);
  if ("error" in access) return access.error;

  const status = await getStoreCredentialStatus(storeId, provider);
  return NextResponse.json(status);
}

type CredentialsPostBody = {
  storeId?: unknown;
  provider?: unknown;
  value?: unknown;
};

export async function POST(request: Request) {
  let body: CredentialsPostBody;
  try {
    body = (await request.json()) as CredentialsPostBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { storeId, provider, value } = body;

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }
  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { error: "Campo 'provider' e obrigatorio e deve ser 'mercado_pago' ou 'whatsapp'." },
      { status: 400 },
    );
  }
  if (!isNonEmptyString(value)) {
    return NextResponse.json({ error: "Campo 'value' e obrigatorio." }, { status: 400 });
  }

  const access = await requireSettingsAccess(request, storeId);
  if ("error" in access) return access.error;

  try {
    await upsertStoreCredential(storeId, provider, value);
  } catch (error) {
    console.error("[api/store/credentials] Falha ao salvar credencial", { storeId, provider, error });
    return NextResponse.json({ error: "Nao foi possivel salvar a credencial." }, { status: 500 });
  }

  // Nunca retorna o valor salvo — apenas confirma o status atualizado.
  const status = await getStoreCredentialStatus(storeId, provider);
  return NextResponse.json(status, { status: 201 });
}
