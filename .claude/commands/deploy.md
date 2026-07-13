---
description: Delega ao code-reviewer; se houver bloqueantes, aciona análise e correção de bug antes de liberar o deploy.
---

1. Acione `code-reviewer` sobre o estado atual do projeto.
2. Se houver qualquer achado BLOQUEANTE:
   - Para cada um, rode o fluxo equivalente a `/analisa-bug` (investigação de causa raiz) e depois `/corrigir-bug` (correção via orquestrador)
   - Repita o review até não haver mais BLOQUEANTES
3. Quando não houver BLOQUEANTES pendentes, sinalize ao usuário que o projeto está pronto para deploy e liste os achados IMPORTANTE/SUGESTÃO remanescentes (não bloqueiam, mas devem ser considerados).
4. Nunca execute o deploy em si (`vercel --prod`) automaticamente — apenas sinalize que está liberado; a execução do deploy é decisão do usuário.
