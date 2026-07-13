---
description: Recebe o plano gerado por /analisa-bug e delega a correção aos sub-agents responsáveis via orquestrador.
argument-hint: [plano de correção]
---

Plano de correção: $ARGUMENTS

1. Acione o agent `orquestrador` para delegar a correção ao(s) sub-agent(s) especialista(s) do domínio afetado.
2. Garanta que um teste que reproduz o bug seja escrito antes da correção (regressão).
3. Após a correção, rode a suíte de testes e acione `code-reviewer`.
4. Reporte ao usuário: o que foi corrigido, o teste de regressão adicionado, e o resultado do review.
