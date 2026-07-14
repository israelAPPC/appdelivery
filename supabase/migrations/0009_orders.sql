-- 0009_orders.sql
-- Checkout: Mercado Pago + pagar na entrega/retirada (Task 3.2)
--
-- Cria a tabela `orders`, contrato acordado com a Task 3.3 (painel de
-- pedidos em tempo real), que consome esta mesma tabela via Realtime.
--
-- Pedidos sao criados pelo cliente final no storefront, SEM autenticacao
-- (nao existe login de cliente no MVP — ver SPEC.md). Por isso a insercao
-- em `orders` e feita exclusivamente pelo route handler
-- `app/api/checkout/route.ts`, usando o client `service_role`
-- (`createSupabaseAdminClient`), depois de recalcular o total no backend —
-- nunca existe policy de INSERT para `anon`/`authenticated` nesta tabela.
-- Leitura/atualizacao (painel do lojista) seguem o mesmo padrao multi-tenant
-- das demais tabelas: somente usuario vinculado a propria loja
-- (`store_users`), via RLS.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0010_..., etc).

-- =========================================================================
-- Tabela: orders
-- =========================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  order_number bigint generated always as identity,
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb,
  items jsonb not null,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  shipping_cost numeric(10, 2) not null check (shipping_cost >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  total numeric(10, 2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('mp_online', 'on_delivery')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending_offline', 'pending', 'paid', 'failed')),
  fulfillment_type text not null check (fulfillment_type in ('delivery', 'pickup')),
  status text not null default 'recebido'
    check (status in ('recebido', 'preparo', 'entrega', 'concluido')),
  created_at timestamptz not null default now(),
  -- Pedido de retirada (`pickup`) nunca tem endereco de entrega; pedido de
  -- entrega (`delivery`) sempre precisa de um endereco.
  constraint orders_delivery_address_matches_fulfillment check (
    (fulfillment_type = 'pickup' and delivery_address is null)
    or (fulfillment_type = 'delivery' and delivery_address is not null)
  )
);

comment on table public.orders is 'Pedidos do storefront de cada loja (tenant): itens, valores, forma de pagamento/entrega e status operacional.';
comment on column public.orders.items is 'Array JSON dos itens do pedido: [{productId, name, quantity, unitPrice, subtotal}, ...]. Nunca confiar em precos vindos do client; sempre re-hidratados/validados contra `products` no backend (app/api/checkout/route.ts).';
comment on column public.orders.total is 'subtotal + shipping_cost - discount, SEMPRE recalculado no backend (nunca aceito diretamente do client). Ver CLAUDE.md/seguranca.md.';
comment on column public.orders.payment_method is 'mp_online = Checkout Pro do Mercado Pago; on_delivery = pagar na entrega/retirada (sem chamada ao Mercado Pago).';
comment on column public.orders.payment_status is 'pending_offline = pagamento na entrega/retirada, ainda nao cobrado; pending = preferencia MP criada, aguardando pagamento; paid/failed = definidos exclusivamente pelo webhook do Mercado Pago validado (Fase 4), nunca por esta rota de checkout.';

create index if not exists orders_store_id_idx on public.orders (store_id);
create index if not exists orders_store_id_created_at_idx on public.orders (store_id, created_at desc);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.orders enable row level security;

-- Leitura: somente usuario vinculado a propria loja (painel do lojista).
-- Nunca ha leitura publica/anonima de pedidos (dados do cliente/endereco).
create policy orders_select_own_store
  on public.orders
  for select
  to authenticated
  using (store_id in (select public.current_user_store_ids()));

-- Atualizacao (mudanca de status operacional pelo painel — Task 3.3, e
-- futuramente o webhook do Mercado Pago via service_role na Fase 4):
-- somente usuario vinculado a propria loja pode atualizar via client comum.
create policy orders_update_own_store
  on public.orders
  for update
  to authenticated
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

-- Nao existe policy de INSERT para `anon`/`authenticated`: a criacao de
-- pedido e feita exclusivamente pelo route handler de checkout, que usa o
-- client `service_role` (ignora RLS por definicao), apos validar/recalcular
-- tudo no backend. Isso evita que o cliente final (sem sessao) escreva
-- diretamente na tabela com valores arbitrarios.

-- Nao existe policy de DELETE: pedidos nunca sao apagados via API (fora de
-- escopo desta task; decisao de retencao/expurgo fica para o futuro).

-- =========================================================================
-- Realtime
-- =========================================================================
-- Habilita a tabela na publicacao padrao do Supabase Realtime, consumida
-- pela Task 3.3 (subscription do painel de pedidos, filtrada por store_id
-- no client).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
