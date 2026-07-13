---
description: Investiga a causa raiz de um bug via orquestrador e entrega relatório com possível solução.
argument-hint: [descrição do bug]
---

Bug relatado: $ARGUMENTS

1. Acione o agent `orquestrador` para investigar a causa raiz, delegando a leitura/investigação ao(s) sub-agent(s) do domínio afetado (ex: backend-payments para bug de checkout, backend-store para bug de frete).
2. Não corrija nada nesta etapa — apenas investigue.
3. Entregue um relatório com: sintoma, causa raiz identificada, arquivo(s)/linha(s) envolvidos, e um plano de correção proposto.
4. Ao final, sugira rodar `/corrigir-bug [plano]` passando o plano proposto.
