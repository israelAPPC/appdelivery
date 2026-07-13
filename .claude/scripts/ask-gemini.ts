#!/usr/bin/env node
/**
 * Dispara uma solicitação pontual ao Google Gemini para tarefas de baixo
 * risco/custo (análises de texto, sugestão de casos de teste, resumo de
 * logs, revisão superficial de copy) — sem consumir o orçamento de tokens
 * do Claude para tarefas que não exigem raciocínio profundo sobre o código.
 *
 * Uso: node ask-gemini.ts "resuma esse log de erro e sugira a causa provável" --file erro.log
 *
 * Requer: GEMINI_API_KEY no ambiente (.env, nunca commitado).
 * npm install @google/generative-ai
 */
import { readFileSync } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Erro: defina GEMINI_API_KEY no ambiente antes de usar este script.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const prompt = args.filter((a) => a !== "--file" && args[args.indexOf(a) - 1] !== "--file").join(" ");
  const fileContent = fileIdx >= 0 ? readFileSync(args[fileIdx + 1], "utf-8") : "";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const fullPrompt = fileContent ? `${prompt}\n\n---\n${fileContent}` : prompt;
  const result = await model.generateContent(fullPrompt);

  console.log(result.response.text());
}

main();
