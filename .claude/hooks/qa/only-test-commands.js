#!/usr/bin/env node
// PreToolUse hook para o agent de QA/Testes.
// Permite apenas comandos de execução de testes (npm test, vitest). Bloqueia qualquer outro Bash.

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  if (payload.tool_name !== "Bash") process.exit(0);

  const command = (payload.tool_input && payload.tool_input.command) || "";
  const allowed = [/^npm run test/, /^npx vitest/, /^vitest/, /^npm test/];

  const isAllowed = allowed.some((re) => re.test(command.trim()));
  if (!isAllowed) {
    console.error(
      `Bloqueado: o agent de QA só pode executar comandos de teste (npm run test, vitest). ` +
        `Comando recusado: "${command}"`
    );
    process.exit(2);
  }

  process.exit(0);
});
