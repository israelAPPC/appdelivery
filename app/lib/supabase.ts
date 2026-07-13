import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Client Supabase para uso no browser / client components.
 *
 * Usa apenas a anon key publica — toda leitura/escrita feita com este
 * client passa pelas policies de RLS (nunca ignora `store_id`).
 *
 * NUNCA importar `SUPABASE_SERVICE_ROLE_KEY` neste arquivo.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar configuradas (ver .env.example).",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
