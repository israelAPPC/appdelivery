#!/usr/bin/env node
// UserPromptSubmit hook — busca conhecimento relevante para o prompt atual
// e injeta no contexto via saída em stdout (adicionada ao contexto pelo harness).

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

  const prompt = payload.prompt || "";
  const activeAgent = payload.active_agent || "";
  if (!prompt.trim()) process.exit(0);

  try {
    const result = execSync(
      `npx tsx .claude/scripts/search.ts --agent "${activeAgent}" --query "${prompt.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (result) {
      console.log(`Conhecimento relevante encontrado em sessões anteriores:\n\n${result}`);
    }
  } catch {
    // rag.db pode não existir ainda em projetos novos — falha silenciosa, não bloqueia o prompt
  }

  process.exit(0);
});
