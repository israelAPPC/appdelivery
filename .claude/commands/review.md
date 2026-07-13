---
description: Aciona o code-reviewer contra SPEC.md e PLAN.md, classificando achados.
---

Invoque o agent `code-reviewer` para revisar as mudanças pendentes (diff atual ou arquivos indicados pelo usuário), usando `SPEC.md` e `PLAN.md` como referência de comportamento e testes esperados.

Peça ao code-reviewer para classificar cada achado em:
- BLOQUEANTE — impede deploy ou quebra funcionalidade
- IMPORTANTE — deve ser corrigido antes do merge
- SUGESTÃO — melhoria opcional

Apresente o relatório final ao usuário, agrupado por classificação. Não corrija nada automaticamente.
