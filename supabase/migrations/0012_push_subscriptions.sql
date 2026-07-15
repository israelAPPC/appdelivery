-- 0012_push_subscriptions.sql
-- Notificacao push nativa (Web Push API / VAPID) de mudanca de status do
-- pedido (Task 4.3)
--
-- Nao existe login de cliente final no MVP (ver SPEC.md), entao a
-- "assinatura" de push (`PushSubscription` do browser) e vinculada
-- diretamente ao `order_id`, nunca a um usuario logado: o cliente se
-- inscreve para receber updates DAQUELE pedido especifico, no momento do
-- checkout/acompanhamento do pedido no storefront.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0013_..., etc).

-- =========================================================================
-- Tabela: push_subscriptions
-- =========================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- Um mesmo endpoint de push nao deve ser cadastrado duas vezes para o
  -- mesmo pedido (ex.: cliente reabre a pagina e o browser reenvia a mesma
  -- subscription) — evita notificacao duplicada por pedido/dispositivo.
  constraint push_subscriptions_order_endpoint_unique unique (order_id, endpoint)
);

comment on table public.push_subscriptions is 'Assinaturas de Web Push (VAPID) vinculadas a um pedido especifico (sem login de cliente final — ver SPEC.md). Usada por app/lib/notifications.ts para notificar o cliente quando o status do pedido muda.';
comment on column public.push_subscriptions.order_id is 'Pedido ao qual esta subscription esta vinculada. Notificacoes de mudanca de status deste pedido sao enviadas a todas as subscriptions associadas.';
comment on column public.push_subscriptions.endpoint is 'Endpoint da subscription, conforme `PushSubscription.toJSON().endpoint` (formato padrao da Push API).';
comment on column public.push_subscriptions.p256dh is 'Chave publica da subscription, conforme `PushSubscription.toJSON().keys.p256dh`.';
comment on column public.push_subscriptions.auth is 'Segredo de autenticacao da subscription, conforme `PushSubscription.toJSON().keys.auth`.';

create index if not exists push_subscriptions_order_id_idx on public.push_subscriptions (order_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.push_subscriptions enable row level security;

-- Nao existe policy de SELECT/INSERT/UPDATE/DELETE para `anon`/`authenticated`
-- (mesma logica de `orders`, migration 0009): toda insercao e feita pelo
-- route handler `app/api/orders/[id]/push-subscription/route.ts`, usando o
-- client `service_role` (`createSupabaseAdminClient`), depois de validar que
-- o `order_id` existe. A leitura, para disparar a notificacao ao mudar o
-- status do pedido, tambem e feita exclusivamente no backend
-- (`app/lib/notifications.ts`) via `service_role`. Nunca ha leitura direta
-- por um client (browser) — evitaria vazamento de subscription de push de
-- um pedido para outro cliente/loja.
