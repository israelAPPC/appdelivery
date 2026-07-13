---
description: Aciona o orquestrador para montar um plano e delegar a implementação de uma melhoria.
argument-hint: [descrição da melhoria]
---

Melhoria solicitada: $ARGUMENTS

1. Acione o agent `orquestrador` para avaliar o impacto da melhoria em `SPEC.md`/`PLAN.md`.
2. O orquestrador monta um plano curto (task no formato do PLAN.md) e identifica o(s) sub-agent(s) responsável(is).
3. Delegue a implementação, enforçando TDD para qualquer lógica de negócio nova.
4. Acione `code-reviewer` ao final e reporte o resultado.
