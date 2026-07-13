import { NextResponse } from "next/server";
import { createAnonSupabaseClient } from "@/app/lib/auth";

/**
 * POST /api/auth/login
 *
 * Login via Supabase Auth (email/senha). Nao retorna nenhuma informacao de
 * permissao/loja aqui — o client deve chamar `getStorePermissions` (ou uma
 * rota que o faca) para cada loja apos autenticado.
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

  return NextResponse.json(
    {
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    },
    { status: 200 },
  );
}
