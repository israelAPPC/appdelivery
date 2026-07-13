#!/usr/bin/env node
// PostToolUse hook para agents de implementação.
// Roda os testes do módulo após uma edição de arquivo, para feedback rápido.

const { execSync } = require("child_process");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  if (!["Write", "Edit"].includes(payload.tool_name)) process.exit(0);

  const filePath = (payload.tool_input && payload.tool_input.file_path) || "";
  if (!/\.(ts|tsx)$/.test(filePath) || filePath.includes("node_modules")) {
    process.exit(0);
  }

  try {
    execSync("npm run test -- --run", { stdio: "inherit", cwd: process.cwd() });
  } catch {
    console.error(
      "Aviso: os testes falharam após esta edição. Corrija antes de encerrar a task."
    );
  }

  process.exit(0);
});
