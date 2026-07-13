import { NextResponse } from "next/server";
import {
  MAX_USERS_PER_STORE,
  createAuthedSupabaseClient,
  createServiceRoleSupabaseClient,
  getSession,
  getStorePermissions,
} from "@/app/lib/auth";

/**
 * POST /api/auth/invite
 *
 * Admin de uma loja cadastra um funcionario adicional, definindo as
 * permissoes por checkbox (Pedidos, Catalogo, Financeiro, Configuracoes).
 *
 * Regras (CLAUDE.md):
 *  - Maximo de 3 usuarios por loja (validado aqui, no backend).
 *  - Apenas admin da loja pode convidar (checado via `getStorePermissions`,
 *    nunca confiando em um campo de role vindo do client).
 *  - `role` do novo vinculo e sempre 'employee' — nunca aceito do payload do
 *    client (impede que um funcionario convidado seja auto-promovido a admin).
 *
 * Body esperado:
 * {
 *   storeId: string,
 *   email: string,
 *   password: string,
 *   permissions: { orders: boolean, catalog: boolean, financial: boolean, settings: boolean }
 * }
 *
 * Requer header `Authorization: Bearer <access_token>` do admin chamador.
 */

type InviteBody = {
  storeId?: unknown;
  email?: unknown;
  password?: unknown;
  permissions?: {
    orders?: unknown;
    catalog?: unknown;
    financial?: unknown;
    settings?: unknown;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeInputPermissions(raw: InviteBody["permissions"]) {
  return {
    orders: raw?.orders === true,
    catalog: raw?.catalog === true,
    financial: raw?.financial === true,
    settings: raw?.settings === true,
  };
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido (JSON esperado)." }, { status: 400 });
  }

  const { storeId, email, password, permissions } = body;

  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }
  if (!isNonEmptyString(email)) {
    return NextResponse.json({ error: "Campo 'email' e obrigatorio." }, { status: 400 });
  }
  if (!isNonEmptyString(password) || password.length < 6) {
    return NextResponse.json(
      { error: "Campo 'password' e obrigatorio e deve ter ao menos 6 caracteres." },
      { status: 400 },
    );
  }

  // Reconstroi um client autenticado como o chamador a partir do token da
  // sessao ja validada por `getSession`.
  const authedClient = createAuthedSupabaseClient(session.accessToken);

  // Apenas admin da loja pode convidar — checagem sempre no backend, nunca
  // apenas no frontend.
  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || access.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o admin da loja pode cadastrar novos usuarios." },
      { status: 403 },
    );
  }

  // Limite de 3 usuarios por loja (admin + funcionarios), validado no backend.
  //
  // ATENCAO — risco residual (TOCTOU): esta checagem (contar, depois inserir)
  // nao e atomica. Duas requisicoes concorrentes de convite para a mesma loja
  // podem ambas ler `count < MAX_USERS_PER_STORE` antes de qualquer uma inserir,
  // furando o limite de 3 usuarios. A validacao definitiva e no NIVEL DO BANCO
  // (constraint/trigger em `store_users` que rejeite o insert quando ja houver
  // 3 vinculos para o `store_id`), a ser implementada pelo agent backend-db em
  // migration separada. Nao implementar aqui lock otimista/pessimista de
  // aplicacao — complexidade desproporcional para o MVP dado que o dano de uma
  // corrida rara (4o usuario) e baixo e sera bloqueado no banco.
  const { count, error: countError } = await authedClient
    .from("store_users")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (countError) {
    // Erro real de infraestrutura/conexao com o banco (nao e "limite atingido")
    // — nunca deve ser reportado ao client como 400 de validacao.
    console.error("[api/auth/invite] Falha ao consultar contagem de store_users", {
      storeId,
      error: countError,
    });
    return NextResponse.json(
      { error: "Erro interno ao verificar o limite de usuarios da loja." },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= MAX_USERS_PER_STORE) {
    return NextResponse.json(
      { error: `Limite de ${MAX_USERS_PER_STORE} usuarios por loja atingido.` },
      { status: 400 },
    );
  }

  const serviceRole = createServiceRoleSupabaseClient();

  // Cria a conta de Auth do novo funcionario (ele ainda nao tem sessao propria
  // neste fluxo — o admin define a senha inicial).
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

  // Insert feito com o client do ADMIN chamador (nunca service_role): a
  // policy `store_users_insert_admin_only` exige que o chamador ja seja
  // admin da loja, o que evita reintroduzir a brecha de escalonamento de
  // privilegio corrigida na migration 0002. `role` e SEMPRE 'employee' aqui,
  // nunca vindo do body.
  const { data: link, error: insertError } = await authedClient
    .from("store_users")
    .insert({
      store_id: storeId,
      user_id: newUserId,
      role: "employee",
      permissions: normalizeInputPermissions(permissions),
    })
    .select()
    .single();

  if (insertError || !link) {
    // Rollback: nao deixar usuario de Auth orfao sem vinculo a loja.
    await serviceRole.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: insertError?.message ?? "Nao foi possivel vincular o novo usuario a loja." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      user: { id: newUserId, email },
      storeUser: link,
    },
    { status: 201 },
  );
}
