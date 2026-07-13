---
paths: "tests/**/*"
---

# Testes

- Framework: Vitest (+ Testing Library para componentes React).
- Estrutura espelha `app/`: `tests/lib/`, `tests/api/`, `tests/components/`.
- Todo teste de webhook/pagamento cobre o caso de reenvio duplicado (idempotência).
- Todo teste de RLS/multi-tenant cobre o caso de tentativa de acesso cross-tenant (deve falhar).
- Não usar mocks para regras de cálculo puras (frete, total do pedido) — testar a função real com inputs variados.
