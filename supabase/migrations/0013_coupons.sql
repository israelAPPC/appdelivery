-- 0013_coupons.sql
-- Cupons de desconto por loja (Task 5.2)
--
-- Cria a tabela `coupons`, gerenciada pelo admin/funcionario com permissao
-- `catalog` (mesma permissao usada para produtos/categorias, ver
-- 0004_products.sql e app/lib/auth.ts) e validada no backend do checkout
-- (app/api/checkout/route.ts), nunca diretamente pelo client.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0014_..., etc).

-- =========================================================================
-- Tabela: coupons
-- =========================================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed', 'free_shipping')),
  discount_value numeric(10, 2),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- percentual valido (0-100) quando discount_type = 'percentage'; valor
  -- fixo deve ser > 0 quando discount_type = 'fixed'; free_shipping ignora
  -- discount_value (deve ser null).
  constraint coupons_discount_value_matches_type check (
    (discount_type = 'percentage' and discount_value is not null and discount_value > 0 and discount_value <= 100)
    or (discount_type = 'fixed' and discount_value is not null and discount_value > 0)
    or (discount_type = 'free_shipping' and discount_value is null)
  )
);

comment on table public.coupons is 'Cupons de desconto de cada loja (tenant), aplicados no checkout do storefront.';
comment on column public.coupons.code is 'Codigo digitado pelo cliente no checkout (ex: "PROMO10"). Unicidade case-insensitive por loja via indice (coupons_store_id_lower_code_idx).';
comment on column public.coupons.discount_type is 'percentage = percentual sobre o subtotal; fixed = valor fixo em R$; free_shipping = zera o frete ja calculado, sem alterar o subtotal.';
comment on column public.coupons.discount_value is 'Percentual (0-100) se percentage, valor em R$ se fixed; sempre null se free_shipping.';
comment on column public.coupons.expires_at is 'Data/hora de expiracao do cupom. Null = nunca expira.';

create index if not exists coupons_store_id_idx on public.coupons (store_id);

-- Unicidade case-insensitive de codigo por loja: cliente pode digitar em
-- qualquer case, mas duas lojas podem ter o mesmo codigo, e uma loja nunca
-- pode ter dois cupons com o mesmo codigo (ignorando case).
create unique index if not exists coupons_store_id_lower_code_idx
  on public.coupons (store_id, lower(code));

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.coupons enable row level security;

-- Nao existe policy de leitura publica (anon): a validacao de cupom no
-- checkout acontece inteiramente no backend via service_role
-- (app/api/checkout/route.ts), nunca diretamente do client — mais simples e
-- seguro do que expor regra de desconto (ex.: valores de outros cupons) na
-- listagem publica.

-- Gestao (leitura/escrita) do admin/funcionario da propria loja: mesma
-- checagem fina de permissao ("catalog") feita na camada de aplicacao (RLS
-- so tem visibilidade de store_id, nao das permissoes por checkbox).
create policy coupons_select_own_store
  on public.coupons
  for select
  to authenticated
  using (store_id in (select public.current_user_store_ids()));

create policy coupons_insert_own_store
  on public.coupons
  for insert
  to authenticated
  with check (store_id in (select public.current_user_store_ids()));

create policy coupons_update_own_store
  on public.coupons
  for update
  to authenticated
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

create policy coupons_delete_own_store
  on public.coupons
  for delete
  to authenticated
  using (store_id in (select public.current_user_store_ids()));
