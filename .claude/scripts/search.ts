#!/usr/bin/env node
/**
 * Recebe a pergunta atual e o agent ativo, busca os top-3 chunks mais
 * similares em rag.db (similaridade de cosseno calculada em JS, sem
 * extensão nativa), priorizando chunks da mesma categoria do agent,
 * e imprime o conteúdo para ser injetado no contexto (stdout).
 *
 * Uso: node search.ts --agent backend-payments --query "como tratamos webhook duplicado?"
 */
import { existsSync } from "fs";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "@xenova/transformers";

const DB_PATH = join(process.cwd(), "rag.db");
const TOP_K = 3;

const AGENT_CATEGORY_PRIORITY: Record<string, string> = {
  "backend-payments": "bug",
  "backend-db": "decisao-arquitetura",
  "backend-store": "decisao-arquitetura",
  "frontend-storefront": "padrao",
  "frontend-admin": "padrao",
  "backend-notifications": "nao-funcionou",
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // embeddings já normalizados (normalize: true no embedder)
}

async function main() {
  if (!existsSync(DB_PATH)) {
    process.exit(0); // rag.db ainda não existe (projeto novo) — falha silenciosa
  }

  const args = process.argv.slice(2);
  const agentIdx = args.indexOf("--agent");
  const queryIdx = args.indexOf("--query");
  const agent = agentIdx >= 0 ? args[agentIdx + 1] : "";
  const query = queryIdx >= 0 ? args.slice(queryIdx + 1).join(" ") : "";

  if (!query) {
    console.error("Uso: node search.ts --agent <nome> --query <pergunta>");
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const output = await embedder(query, { pooling: "mean", normalize: true });
  const queryEmbedding = Array.from(output.data as Float32Array);

  const priorityCategory = AGENT_CATEGORY_PRIORITY[agent];

  const rows = db
    .prepare("SELECT content, category, agent, embedding FROM knowledge")
    .all() as { content: string; category: string; agent: string; embedding: string }[];

  const scored = rows.map((row) => ({
    ...row,
    score:
      cosineSimilarity(queryEmbedding, JSON.parse(row.embedding)) +
      (row.category === priorityCategory ? 0.1 : 0), // leve boost para categoria prioritária do agent
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_K);

  if (top.length === 0) {
    process.exit(0);
  }

  const context = top.map((r) => `[${r.category} / ${r.agent}]\n${r.content}`).join("\n\n---\n\n");
  console.log(context);
  db.close();
}

main();
