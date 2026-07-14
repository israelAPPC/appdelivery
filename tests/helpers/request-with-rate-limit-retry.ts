/**
 * Helper compartilhado de teste (nao produtivo): repete uma chamada a uma
 * rota (route handler) quando a resposta indica rate limit do Supabase Auth
 * (`AuthApiError: Request rate limit reached`, propagado como mensagem de
 * erro no corpo da resposta). Varios testes de integracao em `tests/api/**`
 * criam usuarios em sequencia rapida contra o mesmo projeto Supabase real,
 * o que pode disparar esse rate limit de forma intermitente sob carga
 * (varios agents/test files rodando em paralelo).
 *
 * Nunca mascara falha real (ex.: 400 de validacao, 401 de credencial
 * invalida) — so tenta novamente quando a mensagem de erro do corpo da
 * resposta bate com o padrao de rate limit, e ainda assim devolve a ultima
 * resposta/corpo obtidos caso todas as tentativas se esgotem.
 */
export async function requestWithRateLimitRetry<TBody = unknown>(
  perform: () => Promise<Response>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<{ response: Response; body: TBody }> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 800;

  let response: Response;
  let body: TBody;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    response = await perform();
    body = (await response
      .clone()
      .json()
      .catch(() => undefined)) as TBody;

    const errorMessage = (body as { error?: unknown } | undefined)?.error;
    const isRateLimited = typeof errorMessage === "string" && /rate limit/i.test(errorMessage);

    if (!isRateLimited || attempt === attempts) {
      return { response, body };
    }

    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
  }

  // Inalcancavel (loop sempre retorna), mas necessario para o TypeScript.
  throw new Error("requestWithRateLimitRetry: loop de tentativas terminou sem retornar.");
}
