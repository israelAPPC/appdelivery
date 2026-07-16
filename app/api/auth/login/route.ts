import { NextResponse } from "next/server";
import {
  createAnonSupabaseClient,
  createAuthedSupabaseClient,
  getStorePermissions,
  type StorePermissions,
  type StoreRole,
} from "@/app/lib/auth";

/**
 * POST /api/auth/login
 *
 * Login via Supabase Auth (email/senha). Apos autenticar, resolve a loja
 * vinculada ao usuario em `store_users`.
 *
 * PREMISSA (decisao de produto, nao unilateral do agent): 1 loja por
 * usuario — o SPEC.md atual nao cobre multiplas lojas por usuario. Essa
 * premissa foi explicitamente mantida pelo usuario ao revisar este fluxo.
 * Ainda assim, a resolucao da loja e feita de forma deterministica
 * (`order` + `limit(1)`) para que, se um vinculo extra existir por qualquer
 * motivo (dado inconsistente, bug futuro etc.), o login nao falhe
 * silenciosamente — sempre resolve para uma unica loja de forma previsivel.
 *
 * A consulta usa um client autenticado com o proprio token do usuario
 * (`createAuthedSupabaseClient`), nunca service_role, entao continua sujeita
 * a RLS (`store_users_select_own_store`) — defesa em profundidade, mesmo
 * sendo apenas leitura do proprio vinculo.
 *
 * Se a consulta a `store_users` retornar erro, ele e logado (sem dados
 * sensiveis) para observabilidade, e o login e tratado como "sem store"
 * (nunca quebra o login por causa dessa consulta auxiliar).
 *
 * Se o usuario nao tiver nenhuma loja vinculada, a resposta e retornada sem
 * o campo `store` (login continua funcionando normalmente; quem decide o que
 * fazer sem loja e o client, ex.: redirecionar para /cadastro).
 *
 * Body esperado: { email: string, password: string }
 */

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { email, password } = body;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return NextResponse.json({ error: "Campos 'email' e 'password' sao obrigatorios." }, { status: 400 });
  }

  const client = createAnonSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    // Mensagem generica: nunca indicar se o e-mail existe ou nao.
    return NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });
  }

  const authedClient = createAuthedSupabaseClient(data.session.access_token);
  const { data: storeUser, error: storeUserError } = await authedClient
    .from("store_users")
    .select("store_id")
    .eq("user_id", data.user.id)
    .order("store_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (storeUserError) {
    // Nao vaza detalhes sensiveis (payload/query), apenas sinaliza a falha.
    console.error("Erro ao resolver store_users no login:", storeUserError.message);
  }

  let storePayload: { id: string; role: StoreRole; permissions: StorePermissions } | null = null;
  if (storeUser) {
    const access = await getStorePermissions(data.user.id, storeUser.store_id, authedClient);
    storePayload = {
      id: storeUser.store_id,
      role: access?.role ?? "employee",
      permissions:
        access?.permissions ?? { orders: false, catalog: false, financial: false, settings: false },
    };
  }

  return NextResponse.json(
    {
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      ...(storePayload ? { store: storePayload } : {}),
    },
    { status: 200 },
  );
}
