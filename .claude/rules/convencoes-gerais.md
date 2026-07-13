---
paths: "**/*"
---

# Convenções gerais (incondicional)

- Arquivos e pastas em kebab-case; variáveis e funções em camelCase; tabelas/colunas SQL em snake_case.
- TypeScript estrito, sem `any`.
- Nenhuma lógica de negócio nova sem teste crítico correspondente escrito antes (TDD — ver CLAUDE.md).
- Multi-tenant: toda query/mutação passa `store_id` explicitamente, nunca assume loja implícita.
- Decisões em aberto (cobrança de assinatura, fidelização) não devem ser resolvidas unilateralmente por um agent — sinalizar ao orquestrador/usuário.
