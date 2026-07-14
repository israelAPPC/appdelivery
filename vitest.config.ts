import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Testes em tests/db/** e alguns em tests/api/** rodam contra o projeto
    // Supabase real (signup/signIn via Auth API) e podem falhar de forma
    // intermitente por eventual consistencia do backend de Auth sob carga
    // (varios testes de integracao criando usuarios/sessoes em sequencia
    // rapida). Retry automatico evita flakiness sem mascarar falha
    // determinística de regra de negocio/RLS.
    retry: 2,
    // beforeAll/afterAll de tests/db/** e tests/api/** fazem varias chamadas
    // sequenciais de rede contra o Supabase real (signup, signIn, inserts);
    // o default de 10s e curto demais sob carga (varios arquivos de teste
    // concorrentes no mesmo projeto).
    hookTimeout: 30000,
    // Muitos testes em tests/db/** e tests/api/** rodam contra o mesmo
    // projeto Supabase real e criam usuarios via Auth API (signup/
    // auth.admin.createUser). Executar todos os arquivos de teste em
    // paralelo dispara o rate limit de Auth do Supabase sob carga
    // ("Request rate limit reached"). Desabilitar paralelismo entre
    // arquivos evita isso sem precisar mockar as integracoes reais.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` lança erro fora do bundler de RSC do Next.js (que resolve
      // a condition "react-server"). Em testes (Vitest/Node puro) isso quebraria
      // qualquer import de `app/lib/supabase-server.ts`, então mockamos o
      // pacote como no-op apenas no ambiente de teste.
      "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
});
