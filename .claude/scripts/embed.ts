#!/usr/bin/env node
/**
 * Lê um .md gerado por summarize.ts, quebra em chunks de 200-300 tokens,
 * gera embeddings com all-MiniLM-L6-v2 (via @xenova/transformers, roda local/WASM,
 * sem depender de API externa nem de compilação nativa) e insere em rag.db
 * (arquivo local na raiz do projeto — ver schema.sql).
 *
 * Uso: node embed.ts .claude/knowledge/2026-07-12-backend-payments.md
 */
import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "@xenova/transformers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(process.cwd(), "rag.db");
const CHUNK_SIZE_WORDS = 220; // aproximação de 200-300 tokens

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE_WORDS) {
    chunks.push(words.slice(i, i + CHUNK_SIZE_WORDS).join(" "));
  }
  return chunks;
}

function parseFrontmatter(md: string): { agent: string } {
  const agentMatch = md.match(/agent:\s*(.+)/);
  return { agent: agentMatch ? agentMatch[1].trim() : "desconhecido" };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: node embed.ts <caminho-do-md>");
    process.exit(1);
  }

  const md = readFileSync(filePath, "utf-8");
  const { agent } = parseFrontmatter(md);
  const chunks = chunkText(md);

  const db = new DatabaseSync(DB_PATH);
  db.exec(readFileSync(join(__dirname, "schema.sql"), "utf-8"));

  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const categoriesBySection: Record<string, string> = {
    "Bugs resolvidos (causa raiz)": "bug",
    "Decisões de arquitetura": "decisao-arquitetura",
    "Padrões adotados": "padrao",
    "O que não funcionou": "nao-funcionou",
  };

  const insertStmt = db.prepare(
    "INSERT INTO knowledge (path, content, category, agent, embedding) VALUES (?, ?, ?, ?, ?)"
  );

  let currentCategory = "geral";
  let inserted = 0;
  for (const chunk of chunks) {
    for (const [section, cat] of Object.entries(categoriesBySection)) {
      if (chunk.includes(section)) currentCategory = cat;
    }
    if (chunk.trim().length < 10) continue; // pula chunks vazios/insignificantes

    const output = await embedder(chunk, { pooling: "mean", normalize: true });
    const embedding = Array.from(output.data as Float32Array);

    insertStmt.run(basename(filePath), chunk, currentCategory, agent, JSON.stringify(embedding));
    inserted++;
  }

  console.log(`Indexados ${inserted} chunks de ${filePath} em ${DB_PATH}`);
  db.close();
}

main();
