-- 0001_init.sql
-- Schema base + RLS multi-tenant (Task 1.1)
--
-- Cria as tabelas fundamentais do sistema multi-tenant:
--   - stores: dados da loja
--   - store_users: vinculo usuario (auth.users) <-> loja, com role + permissions (checkboxes)
--
-- Toda tabela com dado de loja tem coluna store_id com FK para stores.id,
-- e RLS habilitada filtrando por store_id, conforme CLAUDE.md / regras/seguranca.md.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser alterada.
-- Mudancas futuras de schema devem ser feitas em novas migrations (0002_..., 0003_...).

-- Extensao necessaria para gen_random_uuid()
create extension if not exists pgcrypto;

-- =========================================================================
-- Tabela: stores
-- =========================================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address_street text,
  address_number text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_zip_code text,
  address_latitude double precision,
  address_longitude double precision,
  logo_url text,
  phone text,
  whatsapp_number text,
  opening_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stores is 'Dados cadastrais de cada loja (tenant) da plataforma.';
comment on column public.stores.opening_hours is 'Horario de funcionamento por dia da semana, formato JSON livre (refinado em tasks futuras).';

-- =========================================================================
-- Tabela: store_users
-- Vinculo usuario <-> loja. Usa auth.users do Supabase Auth diretamente
-- (sem tabela de perfil separada nesta task).
-- =========================================================================
create table if not exists public.store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  -- Permissoes por checkbox (modulo Auth & Multi-tenant do SPEC.md):
  -- orders, catalog, financial, settings. Admin ignora este campo (acesso total sempre).
  permissions jsonb not null default '{"orders": true, "catalog": true, "financial": true, "settings": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);

comment on table public.store_users is 'Vinculo entre usuarios (auth.users) e lojas, com papel (admin/employee) e permissoes por checkbox.';
comment on column public.store_users.permissions is 'Permissoes de acesso por secao, usadas apenas quando role = employee.';

-- Garante no maximo 1 admin "principal" nao e obrigatorio aqui (regra de negocio de
-- "ate 3 usuarios por loja" e validada na camada de aplicacao / Task 1.2, nao via constraint SQL).

-- =========================================================================
-- Funcoes auxiliares (SECURITY DEFINER) para as politicas de RLS.
-- Necessarias para evitar recursao de RLS quando uma policy de store_users
-- precisa consultar a propria tabela store_users.
-- =========================================================================

create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select store_id
  from public.store_users
  where user_id = auth.uid();
$$;

comment on function public.current_user_store_ids() is 'Retorna os store_id aos quais o usuario autenticado atual esta vinculado.';

create or replace function public.is_store_admin(target_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users
    where store_id = target_store_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function public.is_store_admin(uuid) is 'Verifica se o usuario autenticado atual e admin da loja informada.';

create or replace function public.store_has_users(target_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users
    where store_id = target_store_id
  );
$$;

comment on function public.store_has_users(uuid) is 'Verifica se a loja ja possui algum store_users vinculado (usado para permitir o bootstrap do primeiro admin).';

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.stores enable row level security;
alter table public.store_users enable row level security;

-- ---- stores ----

-- Um usuario so ve as lojas as quais esta vinculado via store_users.
-- Sem vinculo (sem store_id no contexto de auth) => 0 linhas, nunca erro.
create policy stores_select_own
  on public.stores
  for select
  to authenticated
  using (id in (select public.current_user_store_ids()));

-- Qualquer usuario autenticado pode criar uma loja (fluxo de cadastro do lojista).
-- O vinculo como admin e feito em seguida via insert em store_users (bootstrap).
create policy stores_insert_authenticated
  on public.stores
  for insert
  to authenticated
  with check (true);

create policy stores_update_admin
  on public.stores
  for update
  to authenticated
  using (public.is_store_admin(id))
  with check (public.is_store_admin(id));

create policy stores_delete_admin
  on public.stores
  for delete
  to authenticated
  using (public.is_store_admin(id));

-- ---- store_users ----

create policy store_users_select_own_store
  on public.store_users
  for select
  to authenticated
  using (store_id in (select public.current_user_store_ids()));

-- Permite o bootstrap do primeiro usuario (admin) de uma loja recem-criada,
-- ou insercoes subsequentes feitas por um admin existente da loja.
create policy store_users_insert_bootstrap_or_admin
  on public.store_users
  for insert
  to authenticated
  with check (
    not public.store_has_users(store_id)
    or public.is_store_admin(store_id)
  );

create policy store_users_update_admin
  on public.store_users
  for update
  to authenticated
  using (public.is_store_admin(store_id))
  with check (public.is_store_admin(store_id));

create policy store_users_delete_admin
  on public.store_users
  for delete
  to authenticated
  using (public.is_store_admin(store_id));

-- =========================================================================
-- Trigger utilitario: mantem updated_at atualizado
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_stores
  before update on public.stores
  for each row
  execute function public.set_updated_at();

create trigger set_updated_at_store_users
  before update on public.store_users
  for each row
  execute function public.set_updated_at();
