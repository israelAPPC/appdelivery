#!/usr/bin/env node
// Stop hook (async, por sessão) — captura síntese do que aconteceu na sessão inteira.

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

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) process.exit(0);

  const child = spawn(
    "sh",
    [
      "-c",
      `npx tsx .claude/scripts/summarize.ts --agent "sessao" --input "${transcriptPath}" | xargs -I{} npx tsx .claude/scripts/embed.ts {}`,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  process.exit(0);
});
