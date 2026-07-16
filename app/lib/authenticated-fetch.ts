import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * app/lib/authenticated-fetch.ts
 *
 * Wrapper de `fetch` para chamadas autenticadas do painel admin
 * (client-side). Resolve a pendencia tecnica do `refresh_token` do
 * Supabase nunca ser usado: hoje o `access_token` expira em 1h
 * (`jwt_exp: 3600`) e o usuario tomava 401 sem renovacao automatica.
 *
 * Sempre injeta o `Authorization: Bearer <access_token>` mais recente do
 * `localStorage` (nunca confia em header passado manualmente pelo
 * chamador). Se a resposta vier 401, tenta renovar a sessao UMA unica vez
 * via `auth.refreshSession` (nunca loop infinito) e refaz a requisicao
 * original com o novo token. Se a renovacao falhar, limpa a sessao do
 * `localStorage` e redireciona para `/login`, retornando a resposta 401
 * original ao chamador (sem lancar excecao).
 */

const STORAGE_KEYS = {
  storeId: "app_delivery_store_id",
  accessToken: "app_delivery_access_token",
  refreshToken: "app_delivery_refresh_token",
  role: "app_delivery_role",
  permissions: "app_delivery_permissions",
} as const;

let anonClient: ReturnType<typeof createClient<Database>> | null = null;

function getAnonClient() {
  if (anonClient) return anonClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar configuradas (ver .env.example).",
    );
  }

  anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return anonClient;
}

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string | null): HeadersInit {
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    headers.delete("Authorization");
  }
  return headers;
}

function clearSessionAndRedirectToLogin() {
  window.localStorage.removeItem(STORAGE_KEYS.storeId);
  window.localStorage.removeItem(STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(STORAGE_KEYS.refreshToken);
  window.localStorage.removeItem(STORAGE_KEYS.role);
  window.localStorage.removeItem(STORAGE_KEYS.permissions);
  window.location.href = "/login";
}

export async function authenticatedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const accessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);
  const response = await fetch(input, { ...init, headers: buildAuthHeaders(init, accessToken) });

  if (response.status !== 401) {
    return response;
  }

  const refreshToken = window.localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) {
    clearSessionAndRedirectToLogin();
    return response;
  }

  const { data, error } = await getAnonClient().auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data?.session) {
    clearSessionAndRedirectToLogin();
    return response;
  }

  window.localStorage.setItem(STORAGE_KEYS.accessToken, data.session.access_token);
  window.localStorage.setItem(STORAGE_KEYS.refreshToken, data.session.refresh_token);

  return fetch(input, { ...init, headers: buildAuthHeaders(init, data.session.access_token) });
}
