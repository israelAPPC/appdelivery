-- 0006_store_credentials_vault.sql
-- Central de credenciais de integracao da loja (Task 2.4)
--
-- Guarda, por loja, a credencial de cada provedor de integracao (Mercado
-- Pago, WhatsApp), sem NUNCA persistir o valor em texto plano em uma coluna
-- normal. O valor real fica armazenado no Supabase Vault (extensao nativa
-- baseada em pgsodium); esta tabela guarda apenas a referencia
-- (`secret_id`) ao segredo no Vault, nunca o valor descriptografado.
--
-- Leitura do valor descriptografado (`vault.decrypted_secrets`) so deve
-- acontecer no backend, quando estritamente necessario (ex.: Task 3.2 ao
-- gerar a preferencia de pagamento no Mercado Pago) — nunca em uma rota GET
-- de leitura exposta ao client (CLAUDE.md / regras/seguranca.md).
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras devem ser feitas em novas migrations.

-- Extensao do Supabase Vault (pgsodium por baixo). Ja vem habilitada por
-- padrao em projetos hospedados no Supabase; o "if not exists" aqui e so
-- para tornar a migration idempotente/segura de rodar mais de uma vez.
create extension if not exists supabase_vault cascade;

-- =========================================================================
-- Tabela: store_credentials
-- =========================================================================
create table if not exists public.store_credentials (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  provider text not null check (provider in ('mercado_pago', 'whatsapp')),
  -- Referencia ao segredo armazenado em vault.secrets (via vault.create_secret).
  -- O valor em texto plano NUNCA e persistido em uma coluna desta tabela.
  secret_id uuid not null references vault.secrets (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

comment on table public.store_credentials is 'Referencia (secret_id) a credencial de cada provedor de integracao por loja, com valor real armazenado no Supabase Vault.';
comment on column public.store_credentials.secret_id is 'FK para vault.secrets.id. O valor descriptografado so deve ser lido via vault.decrypted_secrets no backend, nunca exposto por rota GET.';

create trigger set_updated_at_store_credentials
  before update on public.store_credentials
  for each row
  execute function public.set_updated_at();

-- =========================================================================
-- Helper de permissao: settings (admin sempre, ou funcionario com
-- permissions->>'settings' = true). Mesma regra aplicada no backend
-- (app/lib/auth.ts / getStorePermissions), reforcada aqui via RLS.
-- =========================================================================
create or replace function public.has_store_settings_permission(target_store_id uuid)
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
      and (role = 'admin' or coalesce((permissions ->> 'settings')::boolean, false))
  );
$$;

comment on function public.has_store_settings_permission(uuid) is 'Verifica se o usuario autenticado atual pode gerenciar configuracoes (settings) da loja informada: admin sempre, ou funcionario com permissions.settings = true.';

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.store_credentials enable row level security;

create policy store_credentials_select_settings
  on public.store_credentials
  for select
  to authenticated
  using (public.has_store_settings_permission(store_id));

create policy store_credentials_insert_settings
  on public.store_credentials
  for insert
  to authenticated
  with check (public.has_store_settings_permission(store_id));

create policy store_credentials_update_settings
  on public.store_credentials
  for update
  to authenticated
  using (public.has_store_settings_permission(store_id))
  with check (public.has_store_settings_permission(store_id));

create policy store_credentials_delete_settings
  on public.store_credentials
  for delete
  to authenticated
  using (public.has_store_settings_permission(store_id));
