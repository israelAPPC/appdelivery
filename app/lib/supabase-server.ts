import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Clients Supabase para uso exclusivo em server components / route handlers
 * (app/api/**\/route.ts). Este arquivo nunca deve ser importado por
 * client components — o import de `server-only` garante um erro de build
 * caso isso aconteça por engano.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Client server-side "normal": usa a anon key e continua respeitando RLS.
 * Use este client em route handlers que operam em nome de um usuario
 * autenticado (passando o token/sessao do usuario quando aplicavel).
 */
export function createSupabaseServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar configuradas (ver .env.example).",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Client administrativo com `service_role`: IGNORA RLS por completo.
 *
 * Uso restrito a operacoes internas/administrativas que precisam
 * explicitamente contornar RLS (ex.: bootstrap de loja, webhooks
 * validados do Mercado Pago, jobs internos). Nunca usar para responder
 * diretamente a uma leitura solicitada por um client sem antes validar
 * `store_id`/permissoes manualmente no codigo do route handler.
 *
 * NUNCA expor esta chave ou este client a client components/browser.
 */
export function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas (ver .env.example). " +
        "Este client e apenas para uso administrativo interno em server-side.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
