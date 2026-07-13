---
description: Delega uma tarefa de baixo risco/complexidade ao Google Gemini, poupando tokens do Claude.
argument-hint: [tarefa, ex: "analise este arquivo de log e aponte a causa provável do erro"]
---

Tarefa para o Gemini: $ARGUMENTS

Use apenas para tarefas de baixa complexidade onde não é necessário o raciocínio profundo do Claude sobre a arquitetura do projeto: resumir logs, sugerir casos de teste adicionais para uma função já implementada, revisar copy/textos voltados ao usuário, análises exploratórias simples de dados.

Rode: `node .claude/scripts/ask-gemini.ts "$ARGUMENTS"` (adicione `--file <caminho>` se a tarefa envolver um arquivo específico).

Nunca delegue ao Gemini: decisões de arquitetura, implementação de código do projeto, nada que toque segurança/pagamentos/RLS. Essas tarefas continuam exclusivas do Claude e dos sub-agents especializados.
