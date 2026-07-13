import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
