import { NextResponse } from "next/server";
import {
  createAnonSupabaseClient,
  createAuthedSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/app/lib/auth";
import type { Json } from "@/app/lib/database.types";

/**
 * POST /api/auth/signup
 *
 * Cadastro de um novo lojista (admin): cria o usuario via Supabase Auth e,
 * em seguida, chama a RPC `create_store_with_owner` (nunca insere direto na
 * tabela `stores`/`store_users` — ver nota de seguranca em
 * supabase/migrations/0002_fix_store_bootstrap_privilege_escalation.sql,
 * que corrigiu um bug de escalonamento de privilegio nesta mesma area).
 *
 * Body esperado:
 * {
 *   email: string,
 *   password: string,
 *   store: {
 *     name: string,
 *     slug: string,
 *     address_street?, address_number?, address_neighborhood?, address_city?,
 *     address_state?, address_zip_code?, address_latitude?, address_longitude?,
 *     logo_url?, phone?, whatsapp_number?, opening_hours?
 *   }
 * }
 */

type SignupBody = {
  email?: unknown;
  password?: unknown;
  store?: {
    name?: unknown;
    slug?: unknown;
    address_street?: unknown;
    address_number?: unknown;
    address_neighborhood?: unknown;
    address_city?: unknown;
    address_state?: unknown;
    address_zip_code?: unknown;
    address_latitude?: unknown;
    address_longitude?: unknown;
    logo_url?: unknown;
    phone?: unknown;
    whatsapp_number?: unknown;
    opening_hours?: unknown;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { email, password, store } = body;

  if (!isNonEmptyString(email)) {
    return NextResponse.json({ error: "Campo 'email' e obrigatorio." }, { status: 400 });
  }
  if (!isNonEmptyString(password) || password.length < 6) {
    return NextResponse.json(
      { error: "Campo 'password' e obrigatorio e deve ter ao menos 6 caracteres." },
      { status: 400 },
    );
  }
  if (!store || !isNonEmptyString(store.name) || !isNonEmptyString(store.slug)) {
    return NextResponse.json(
      { error: "Campo 'store' e obrigatorio, com 'name' e 'slug' preenchidos." },
      { status: 400 },
    );
  }

  const serviceRole = createServiceRoleSupabaseClient();

  // 1. Cria o usuario de Auth via service_role (email ja confirmado, sem
  //    depender do fluxo de confirmacao por e-mail para o MVP).
  const { data: created, error: createUserError } = await serviceRole.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !created?.user) {
    const message = createUserError?.message ?? "Nao foi possivel criar o usuario.";
    const alreadyExists = /already registered|already exists/i.test(message);
    return NextResponse.json(
      { error: alreadyExists ? "Ja existe uma conta com este e-mail." : message },
      { status: 400 },
    );
  }

  const newUserId = created.user.id;

  // 2. Autentica como o usuario recem-criado, para que a RPC
  //    `create_store_with_owner` capture o auth.uid() correto (nunca um
  //    user_id vindo do payload do client).
  const anonClient = createAnonSupabaseClient();
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    // Rollback: nao deixar usuario de Auth orfao sem loja.
    await serviceRole.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: "Nao foi possivel autenticar o usuario recem-criado." },
      { status: 400 },
    );
  }

  const accessToken = signInData.session.access_token;
  const authedClient = createAuthedSupabaseClient(accessToken);

  // 3. Cria a loja e vincula o chamador como admin, atomicamente, via RPC.
  const asNullableString = (value: unknown): string | null =>
    typeof value === "string" ? value : null;
  const asNullableNumber = (value: unknown): number | null =>
    typeof value === "number" ? value : null;

  const { data: newStore, error: rpcError } = await authedClient.rpc("create_store_with_owner", {
    store_data: {
      name: store.name as string,
      slug: store.slug as string,
      address_street: asNullableString(store.address_street),
      address_number: asNullableString(store.address_number),
      address_neighborhood: asNullableString(store.address_neighborhood),
      address_city: asNullableString(store.address_city),
      address_state: asNullableString(store.address_state),
      address_zip_code: asNullableString(store.address_zip_code),
      address_latitude: asNullableNumber(store.address_latitude),
      address_longitude: asNullableNumber(store.address_longitude),
      logo_url: asNullableString(store.logo_url),
      phone: asNullableString(store.phone),
      whatsapp_number: asNullableString(store.whatsapp_number),
      opening_hours: (store.opening_hours ?? {}) as Json,
    },
  });

  if (rpcError || !newStore) {
    // Rollback: sem loja vinculada, nao faz sentido manter o usuario de Auth.
    await serviceRole.auth.admin.deleteUser(newUserId);
    const message = rpcError?.message ?? "Nao foi possivel criar a loja.";
    const slugTaken = /duplicate key|unique constraint/i.test(message);
    return NextResponse.json(
      { error: slugTaken ? "Ja existe uma loja com este slug." : message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      user: { id: newUserId, email },
      store: newStore,
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      },
    },
    { status: 201 },
  );
}
