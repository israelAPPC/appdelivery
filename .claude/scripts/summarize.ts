#!/usr/bin/env node
/**
 * Recebe um transcript (de agent ou de sessão) via stdin ou arquivo,
 * extrai aprendizados em 4 categorias e salva em .claude/knowledge/YYYY-MM-DD-agent-slug.md
 *
 * Uso: node summarize.ts --agent backend-payments --input transcript.txt
 *      cat transcript.txt | node summarize.ts --agent backend-payments
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const KNOWLEDGE_DIR = join(process.cwd(), ".claude", "knowledge");

interface Learnings {
  bugs: string[];
  decisoes: string[];
  padroes: string[];
  naoFuncionou: string[];
}

function extractLearnings(transcript: string): Learnings {
  // Heurística simples baseada em marcadores textuais. Em produção,
  // isso deve chamar o próprio modelo (via API) para resumir o transcript
  // nas 4 categorias abaixo — aqui fica o parser de fallback determinístico.
  const learnings: Learnings = { bugs: [], decisoes: [], padroes: [], naoFuncionou: [] };

  const lines = transcript.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (/\b(bug|corrigid|causa raiz)\b/i.test(l)) learnings.bugs.push(l);
    else if (/\b(decidi|escolhemos|optamos|arquitetura)\b/i.test(l)) learnings.decisoes.push(l);
    else if (/\b(padrão|convenção|sempre fazemos)\b/i.test(l)) learnings.padroes.push(l);
    else if (/\b(não funcionou|falhou|abandonamos|revertido)\b/i.test(l)) learnings.naoFuncionou.push(l);
  }
  return learnings;
}

function toMarkdown(agentSlug: string, learnings: Learnings): string {
  const date = new Date().toISOString().slice(0, 10);
  return `---
date: ${date}
agent: ${agentSlug}
---

## Bugs resolvidos (causa raiz)
${learnings.bugs.map((b) => `- ${b}`).join("\n") || "- (nenhum registrado nesta sessão)"}

## Decisões de arquitetura
${learnings.decisoes.map((d) => `- ${d}`).join("\n") || "- (nenhuma registrada nesta sessão)"}

## Padrões adotados
${learnings.padroes.map((p) => `- ${p}`).join("\n") || "- (nenhum registrado nesta sessão)"}

## O que não funcionou
${learnings.naoFuncionou.map((n) => `- ${n}`).join("\n") || "- (nada registrado nesta sessão)"}
`;
}

function main() {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf("--agent");
  const inputIdx = args.indexOf("--input");
  const agentSlug = agentIdx >= 0 ? args[agentIdx + 1] : "sessao";

  const transcript =
    inputIdx >= 0 ? readFileSync(args[inputIdx + 1], "utf-8") : readFileSync(0, "utf-8");

  const learnings = extractLearnings(transcript);
  const md = toMarkdown(agentSlug, learnings);

  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(KNOWLEDGE_DIR, `${date}-${agentSlug}.md`);
  writeFileSync(outPath, md, "utf-8");

  console.log(outPath);
}

main();
