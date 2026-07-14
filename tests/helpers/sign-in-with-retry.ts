import type { Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * `signInWithPassword` executado imediatamente apos `auth.admin.createUser`
 * pode falhar de forma intermitente (sem `session`, sem erro claro) por
 * eventual consistencia do backend de Auth do Supabase sob carga (varios
 * testes de integracao de `tests/db/**` e `tests/api/**` criando
 * usuarios/sessoes em sequencia rapida contra o mesmo projeto).
 *
 * Helper compartilhado de retry curto para estabilizar esses testes sem
 * mascarar falha real de autenticacao (lanca apos esgotar as tentativas).
 * Retorna a `Session` obtida, para os casos em que o teste precisa do
 * `access_token` (ex.: montar o header `Authorization` de uma chamada).
 */
export async function signInWithRetry(
  client: SupabaseClient,
  email: string,
  password: string,
  attempts = 3,
): Promise<Session> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
    lastError = error;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError ?? new Error(`signInWithPassword nao retornou sessao para ${email} apos ${attempts} tentativas.`);
}

/**
 * Executa uma chamada assincrona (ex.: `POST /api/auth/signup`) com retry
 * curto, usado nos testes de integracao que criam usuario/loja logo no
 * inicio do arquivo (`beforeAll`) — sob execucao concorrente de muitos
 * arquivos de teste contra o mesmo projeto Supabase, a API de Auth pode
 * responder de forma intermitente (rate limit/eventual consistencia)
 * mesmo para o signup em si, nao so para o signIn subsequente.
 */
export async function withRetry<T>(fn: () => Promise<T>, isValid: (result: T) => boolean, attempts = 3): Promise<T> {
  let lastResult: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    lastResult = await fn();
    if (isValid(lastResult)) return lastResult;
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  return lastResult as T;
}
