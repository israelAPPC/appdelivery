import "dotenv/config";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/app/lib/database.types";

/**
 * Testes de conectividade do client Supabase (Task 1.3).
 *
 * Confirma que e possivel conectar no projeto Supabase real (credenciais
 * em .env) e executar uma query basica de leitura, sem quebrar mesmo se
 * a tabela `stores` estiver vazia.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

const hasCredentials = Boolean(SUPABASE_URL && ANON_KEY);
const runIfConfigured = hasCredentials ? describe : describe.skip;

runIfConfigured("client Supabase (anon)", () => {
  it("conecta no projeto real e consegue contar linhas de stores sem erro, mesmo vazio", async () => {
    const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { count, error, status } = await client
      .from("stores")
      .select("id", { count: "exact", head: true });

    expect(status).toBeLessThan(500);
    expect(error).toBeNull();
    expect(typeof count).toBe("number");
    expect(count as number).toBeGreaterThanOrEqual(0);
  }, 15000);
});

if (!hasCredentials) {
  describe("client Supabase (anon)", () => {
    it.skip("credenciais do Supabase nao configuradas em .env — teste ignorado", () => {});
  });
}
