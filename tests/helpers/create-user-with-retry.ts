import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * `admin.auth.admin.createUser` pode falhar de forma intermitente com
 * `AuthApiError: Request rate limit reached` quando varios testes de
 * integracao (`tests/db/**`, `tests/lib/**`) criam usuarios em sequencia
 * rapida contra o mesmo projeto Supabase real, ainda mais sob carga de
 * multiplos agents/test files rodando em paralelo.
 *
 * Helper compartilhado de retry curto (mesmo padrao de
 * `tests/helpers/sign-in-with-retry.ts`) para estabilizar esses testes sem
 * mascarar falha real de criacao de usuario (lanca apos esgotar as
 * tentativas, ou se o erro nao for de rate limit).
 */
export async function createUserWithRetry(
  admin: SupabaseClient,
  params: { email: string; password: string; email_confirm?: boolean },
  attempts = 4,
): Promise<User> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await admin.auth.admin.createUser(params);
    if (!error && data?.user) return data.user;

    lastError = error;
    const isRateLimited = /rate limit/i.test(error?.message ?? "");
    if (!isRateLimited || attempt === attempts) {
      throw error ?? new Error(`createUser nao retornou usuario para ${params.email}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
  }

  throw lastError ?? new Error(`createUser nao retornou usuario para ${params.email} apos ${attempts} tentativas.`);
}
