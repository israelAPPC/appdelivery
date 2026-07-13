import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { createSupabaseAdminClient } from "./supabase-server";

/**
 * Helpers de autenticacao e permissoes (Task 1.2 — Auth & permissoes por checkbox).
 *
 * Regras de negocio (ver CLAUDE.md):
 *  - Admin sempre tem acesso total, independente do valor salvo em `permissions`.
 *  - Nenhuma checagem de permissao deve confiar apenas no frontend: toda rota
 *    protegida usa `getStorePermissions` no backend, e a RLS do banco (Task 1.1)
 *    e a ultima linha de defesa (`store_users_select_own_store` / `*_admin`).
 *  - `SUPABASE_SERVICE_ROLE_KEY` nunca e exposta aqui para o client; o client
 *    com service_role usado por este modulo (`createServiceRoleSupabaseClient`)
 *    e um reexport de `createSupabaseAdminClient()` de `app/lib/supabase-server.ts`,
 *    que tem `import "server-only"` no topo — isso garante erro de build caso
 *    esse client seja importado por engano em codigo client-side.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type StorePermissions = {
  orders: boolean;
  catalog: boolean;
  financial: boolean;
  settings: boolean;
};

export type StoreRole = "admin" | "employee";

export type StoreAccess = {
  role: StoreRole;
  /** Permissoes efetivas ja resolvidas (admin = tudo `true`, sempre). */
  permissions: StorePermissions;
};

export type Session = {
  user: User;
  accessToken: string;
};

function requireAnonEnv(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar configuradas (ver .env.example).",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/**
 * Client anonimo "puro" (sem sessao), usado para signUp/signIn, onde ainda
 * nao existe um usuario autenticado.
 */
export function createAnonSupabaseClient(): SupabaseClient<Database> {
  const { url, anonKey } = requireAnonEnv();
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Client autenticado como o usuario dono do `accessToken` informado (JWT do
 * Supabase Auth). Todas as queries feitas com este client passam pela RLS
 * como aquele usuario especifico — nunca ignora `store_id`/policies.
 */
export function createAuthedSupabaseClient(accessToken: string): SupabaseClient<Database> {
  const { url, anonKey } = requireAnonEnv();
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Client com service_role. Uso restrito e explicito: apenas para operacoes
 * que legitimamente precisam ignorar RLS (ex.: criar o usuario de Auth de um
 * novo funcionario, que ainda nao tem sessao propria). NUNCA usar para ler ou
 * escrever dados de negocio no lugar da checagem de permissao do usuario.
 * NUNCA importar/usar este client em codigo que roda no browser.
 *
 * Reexport de `createSupabaseAdminClient()` (app/lib/supabase-server.ts),
 * que tem `import "server-only"` no topo do arquivo. Mantido aqui como
 * `createServiceRoleSupabaseClient` para nao quebrar a API publica ja
 * consumida pelas rotas de auth.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient<Database> {
  return createSupabaseAdminClient();
}

/** Extrai o token `Bearer <token>` do header Authorization de uma Request. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve a sessao do usuario autenticado a partir do header `Authorization: Bearer <token>`
 * de uma Request de route handler. Retorna `null` se nao houver token ou se o
 * token for invalido/expirado — nunca lanca excecao para input ausente.
 */
export async function getSession(request: Request): Promise<Session | null> {
  const accessToken = extractBearerToken(request);
  if (!accessToken) return null;

  const client = createAuthedSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;

  return { user: data.user, accessToken };
}

const ALL_PERMISSIONS_TRUE: StorePermissions = {
  orders: true,
  catalog: true,
  financial: true,
  settings: true,
};

function normalizePermissions(raw: unknown): StorePermissions {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    orders: value.orders === true,
    catalog: value.catalog === true,
    financial: value.financial === true,
    settings: value.settings === true,
  };
}

/**
 * Busca em `store_users` o papel (role) e as permissoes efetivas do usuario
 * para a loja informada.
 *
 * Regra explicita do CLAUDE.md: se `role === 'admin'`, retorna TODAS as
 * permissoes como `true`, independentemente do que estiver salvo na coluna
 * `permissions` (defesa em profundidade: mesmo que `permissions` de um admin
 * tenha sido salva incorretamente como restritiva, admin nunca fica bloqueado).
 *
 * Retorna `null` se o usuario nao tiver vinculo com a loja (nunca lanca para
 * esse caso — quem decide o que fazer com `null` e o chamador, ex.: 403).
 *
 * `client` deve ser um client autenticado como o proprio usuario (ver
 * `createAuthedSupabaseClient`) para que a checagem de permissao continue
 * sujeita a RLS (defesa em profundidade — nunca usar service_role aqui).
 */
export async function getStorePermissions(
  userId: string,
  storeId: string,
  client: SupabaseClient<Database>,
): Promise<StoreAccess | null> {
  const { data, error } = await client
    .from("store_users")
    .select("role, permissions")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  if (data.role === "admin") {
    return { role: "admin", permissions: { ...ALL_PERMISSIONS_TRUE } };
  }

  return { role: "employee", permissions: normalizePermissions(data.permissions) };
}

/** Numero maximo de usuarios (admin + funcionarios) por loja (CLAUDE.md). */
export const MAX_USERS_PER_STORE = 3;
