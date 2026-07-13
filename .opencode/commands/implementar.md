---
description: Implementa uma task específica do PLAN.md via orquestrador, com TDD e review automático ao final.
argument-hint: [task, ex: "3.2" ou "checkout online"]
---

Task solicitada: $ARGUMENTS

1. Localize a task correspondente em `PLAN.md` (por número ou por descrição aproximada). Se não existir, avise o usuário e pergunte se deve ser criada antes de prosseguir.
2. Acione o agent `orquestrador` para identificar o(s) sub-agent(s) responsável(is) pela task.
3. Enforce TDD: os "Testes críticos" listados na task devem ser escritos (via `qa-tester` se necessário) antes da implementação.
4. Delegue a implementação ao sub-agent especialista correto.
5. Ao final, acione automaticamente `code-reviewer` sobre o código produzido e reporte os achados ao usuário.
