#!/usr/bin/env node
// Stop hook para agents de implementação.
// Verifica se os testes passam antes de permitir o encerramento da task.

const { execSync } = require("child_process");

try {
  execSync("npm run test -- --run", { stdio: "pipe", cwd: process.cwd() });
  process.exit(0);
} catch (err) {
  console.error(
    "Bloqueado: existem testes falhando. Este agent não pode encerrar a task com testes quebrados. " +
      "Corrija os testes antes de finalizar."
  );
  process.exit(2);
}
