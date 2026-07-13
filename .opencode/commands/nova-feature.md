---
description: Conduz entrevista de clarificação, monta plano em sprints/fases/tasks com TDD obrigatório, e gera documentação técnica e de uso.
argument-hint: [descrição da feature]
---

Feature solicitada: $ARGUMENTS

1. Faça perguntas de clarificação ao usuário (uma de cada vez) até ter clareza suficiente sobre escopo, usuários afetados e critérios de aceite — siga o mesmo espírito da entrevista usada para gerar o SPEC.md original.
2. Acione o agent `orquestrador` para montar um plano no formato do PLAN.md (fases/tasks, com Agent/Input/Output/Testes críticos), incluindo mapa de paralelismo.
3. TDD é obrigatório: nenhuma task do plano pode ser implementada sem os testes críticos definidos antes.
4. Após confirmação do usuário, delegue a implementação via orquestrador.
5. Ao final, gere 2 arquivos em `docs/`:
   - `docs/<feature>-tecnico.md` — decisões técnicas, módulos afetados, schema/endpoints criados
   - `docs/<feature>-uso.md` — como usar a feature, do ponto de vista do lojista/cliente
