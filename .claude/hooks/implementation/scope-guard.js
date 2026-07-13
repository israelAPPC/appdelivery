#!/usr/bin/env node
// PreToolUse hook para agents de implementação (backend/frontend).
// Bloqueia comandos Bash fora do escopo do agent (git push, deploy, comandos destrutivos).

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
  const forbidden = [
    /git\s+push/,
    /git\s+push\s+--force/,
    /vercel\s+deploy/,
    /vercel\s+--prod/,
    /rm\s+-rf/,
    /supabase\s+db\s+push\s+--linked/,
  ];

  const hit = forbidden.find((re) => re.test(command));
  if (hit) {
    console.error(
      `Bloqueado: comando "${command}" está fora do escopo deste agent de implementação. ` +
        `Deploy, push e comandos destrutivos são responsabilidade do orquestrador/usuário, não deste agent.`
    );
    process.exit(2);
  }

  process.exit(0);
});
