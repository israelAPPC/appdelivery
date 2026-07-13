---
paths: "**/*"
---

# Segurança (incondicional)

- Nunca armazenar dados de cartão de crédito — todo pagamento online passa pelo Checkout Pro do Mercado Pago.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` em código client-side ou em resposta de API.
- Toda tabela com dado de loja precisa de RLS filtrando por `store_id`. Sem exceção.
- Nunca confiar em valor total/preço enviado pelo client no checkout — sempre recalcular no backend.
- Nunca marcar pedido como pago sem validar a assinatura do webhook do Mercado Pago.
- Segredos (`.env`, chaves de API) nunca são commitados nem logados.
