---
description: Roda hooks de encerramento, verifica checkboxes do PLAN.md e gera relatório de próximos passos.
---

1. Rode a suíte de testes completa (`npm run test`) e confirme que passa.
2. Percorra `PLAN.md` e verifique quais checkboxes de "Testes críticos" estão de fato cobertos por testes existentes em `tests/`. Marque mentalmente o que está pendente — não edite o PLAN.md sem confirmar com o usuário.
3. Acione `code-reviewer` sobre o estado atual do código.
4. Gere um relatório final com:
   - O que foi entregue (fases/tasks concluídas)
   - O que ainda está pendente no PLAN.md
   - Achados do code-reviewer (BLOQUEANTE/IMPORTANTE/SUGESTÃO)
   - Próximos passos recomendados
5. Só declare "projeto pronto" se não houver achados BLOQUEANTE pendentes.
