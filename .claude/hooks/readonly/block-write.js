#!/usr/bin/env node
// PreToolUse hook para agents somente-leitura (ex: code-reviewer).
// Bloqueia Write, Edit e Bash. exit 2 = bloqueia, exit 0 = permite.

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const blockedTools = ["Write", "Edit", "Bash", "NotebookEdit"];
  if (blockedTools.includes(payload.tool_name)) {
    console.error(
      `Bloqueado: este agent é somente-leitura e não pode usar ${payload.tool_name}. ` +
        `Reporte o problema encontrado em vez de tentar corrigi-lo diretamente.`
    );
    process.exit(2);
  }

  process.exit(0);
});
