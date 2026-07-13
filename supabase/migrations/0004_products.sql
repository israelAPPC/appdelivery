-- 0004_products.sql
-- CRUD de produtos e catalogo (Task 2.1)
--
-- Cria a tabela `products`, vinculada a uma loja (`store_id`), com RLS
-- multi-tenant seguindo o mesmo padrao das migrations anteriores
-- (Task 1.1/1.2): dono/funcionario da loja gerencia os proprios produtos;
-- leitura publica (storefront do cliente, sem autenticacao) so enxerga
-- produtos com `available = true` da loja correspondente.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0005_..., etc).

-- =========================================================================
-- Tabela: products
-- =========================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null check (price > 0),
  category text,
  photo_url text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is 'Catalogo de produtos de cada loja (tenant), com categoria, foto e disponibilidade.';
comment on column public.products.price is 'Preco unitario do produto. Sempre > 0 (constraint no banco, alem da validacao no backend) — nunca zero ou negativo.';
comment on column public.products.available is 'Quando false, o produto nunca aparece na listagem publica do storefront (RLS de leitura anonima filtra por esta coluna).';

create index if not exists products_store_id_idx on public.products (store_id);

drop trigger if exists set_updated_at_products on public.products;
create trigger set_updated_at_products
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.products enable row level security;

-- Leitura publica (anon + authenticated): qualquer pessoa pode listar/ver
-- produtos disponiveis de uma loja, sem precisar estar autenticada (vitrine
-- do storefront do cliente). Produtos indisponiveis nunca sao retornados por
-- esta policy.
create policy products_select_public_available
  on public.products
  for select
  to anon, authenticated
  using (available = true);

-- Leitura autenticada "de gestao": dono/funcionario da loja ve TODOS os
-- produtos da propria loja, incluindo indisponiveis (para o painel admin).
create policy products_select_own_store
  on public.products
  for select
  to authenticated
  using (store_id in (select public.current_user_store_ids()));

-- Escrita (insert/update/delete): somente usuario vinculado a propria loja
-- (`store_users`), nunca de outra loja. A checagem fina de permissao
-- ("catalog") e feita na camada de aplicacao (route handlers), pois RLS
-- so tem visibilidade de `role`/`store_id`, nao das permissoes por checkbox.
create policy products_insert_own_store
  on public.products
  for insert
  to authenticated
  with check (store_id in (select public.current_user_store_ids()));

create policy products_update_own_store
  on public.products
  for update
  to authenticated
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

create policy products_delete_own_store
  on public.products
  for delete
  to authenticated
  using (store_id in (select public.current_user_store_ids()));
