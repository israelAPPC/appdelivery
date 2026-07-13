// Mock de `server-only` para uso exclusivo em testes (Vitest).
//
// O pacote real lança um erro quando importado fora do bundler de React
// Server Components do Next.js (ele so "funciona" - i.e. nao lanca - quando
// o bundler resolve a export condition "react-server"). Em ambiente de teste
// (Vitest/Node puro) isso quebraria qualquer import de modulos que usam
// `import "server-only"` no topo (ex.: app/lib/supabase-server.ts), mesmo
// quando o teste em si roda em contexto server-side legitimo. Por isso este
// no-op e aliasado no lugar do pacote real apenas em `vitest.config.ts`.
export {};
