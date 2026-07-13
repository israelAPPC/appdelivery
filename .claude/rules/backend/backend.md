---
paths: "app/api/**/*.ts, supabase/**/*.sql, app/lib/**/*.ts"
---

# Backend

- Route handlers: um recurso por pasta em `app/api/<recurso>/route.ts`, verbos HTTP como exports nomeados.
- Toda migration nova em `supabase/migrations/`, numerada sequencialmente, nunca editar migration já aplicada.
- Webhooks (Mercado Pago) precisam ser idempotentes — deduplicar por `payment_id`.
- Funções de regra de negócio pura (frete, total do pedido, cupom) ficam em `app/lib/`, nunca inline em route handler.
- Erros de validação retornam 400 com mensagem clara; nunca 500 para input inválido do usuário.
