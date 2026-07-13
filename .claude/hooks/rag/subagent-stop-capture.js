#!/usr/bin/env node
// SubagentStop hook (async) — captura o aprendizado do agent que terminou.
// Roda summarize.ts + embed.ts sobre o transcript do sub-agent, sem bloquear o fluxo.

const { spawn } = require("child_process");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const agentName = payload.agent_name || payload.subagent_type || "sessao";
  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) process.exit(0);

  // Roda em background (não bloqueia o encerramento do sub-agent)
  const child = spawn(
    "sh",
    [
      "-c",
      `npx tsx .claude/scripts/summarize.ts --agent "${agentName}" --input "${transcriptPath}" | xargs -I{} npx tsx .claude/scripts/embed.ts {}`,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  process.exit(0);
});
