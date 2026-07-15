-- 0011_orders_mp_payment_id.sql
-- Webhook de confirmacao de pagamento do Mercado Pago (Task 4.1)
--
-- Adiciona a coluna que guarda o `payment_id` do Mercado Pago associado ao
-- pedido, usada para garantir idempotencia no processamento do webhook:
-- reenvios da mesma notificacao (payment_id repetido) nao devem duplicar o
-- efeito de marcar o pedido como pago. O indice unico parcial abaixo e uma
-- defesa em profundidade no banco, alem da checagem de idempotencia feita
-- na aplicacao (app/api/webhooks/mercado-pago/route.ts).

alter table public.orders
  add column if not exists mp_payment_id text;

comment on column public.orders.mp_payment_id is 'ID do pagamento no Mercado Pago (payment_id), preenchido pelo webhook de confirmacao (Task 4.1) quando o pagamento e aprovado. Nulo enquanto nao ha pagamento confirmado. Usado para garantir idempotencia: reenvio do mesmo webhook nao deve duplicar o efeito de marcar o pedido como pago.';

create unique index if not exists orders_mp_payment_id_unique_idx
  on public.orders (mp_payment_id)
  where mp_payment_id is not null;
