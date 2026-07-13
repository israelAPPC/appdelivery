-- 0007_store_credentials_vault_helpers.sql
-- Funcoes auxiliares (SECURITY DEFINER) para ler/escrever segredos no
-- Supabase Vault a partir da API REST (Task 2.4).
--
-- O schema `vault` nao e exposto diretamente via PostgREST (nem `vault`,
-- nem funcoes soltas de `vault.create_secret`/`vault.decrypted_secrets`
-- sao chamaveis pelo client supabase-js por padrao). Para permitir que
-- `app/lib/store-credentials.ts` opere via RPC, criamos wrappers no schema
-- `public` que chamam o Vault internamente.
--
-- Seguranca: estas funcoes NAO fazem nenhuma checagem de permissao de loja
-- por si so (recebem apenas o valor do segredo ou o id do segredo) — por
-- isso o `execute` e revogado de `anon`/`authenticated` e concedido apenas
-- a `service_role`. A checagem de permissao (`settings`, admin) e feita
-- SEMPRE antes, no route handler (`app/api/store/credentials/route.ts`),
-- usando o client autenticado do usuario chamador.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras devem ser feitas em novas migrations.

create or replace function public.create_vault_secret_for_store(
  p_secret_value text,
  p_secret_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  new_secret_id uuid;
begin
  new_secret_id := vault.create_secret(p_secret_value, p_secret_name);
  return new_secret_id;
end;
$$;

comment on function public.create_vault_secret_for_store(text, text) is
  'Wrapper SECURITY DEFINER sobre vault.create_secret. Uso restrito a service_role, chamado apenas apos checagem de permissao (settings) no backend.';

revoke all on function public.create_vault_secret_for_store(text, text) from public;
revoke all on function public.create_vault_secret_for_store(text, text) from anon;
revoke all on function public.create_vault_secret_for_store(text, text) from authenticated;
grant execute on function public.create_vault_secret_for_store(text, text) to service_role;

create or replace function public.get_decrypted_vault_secret(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_value text;
begin
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where id = p_secret_id;

  return secret_value;
end;
$$;

comment on function public.get_decrypted_vault_secret(uuid) is
  'Wrapper SECURITY DEFINER sobre vault.decrypted_secrets. Uso restrito a service_role; NUNCA expor o retorno em uma rota GET publica.';

revoke all on function public.get_decrypted_vault_secret(uuid) from public;
revoke all on function public.get_decrypted_vault_secret(uuid) from anon;
revoke all on function public.get_decrypted_vault_secret(uuid) from authenticated;
grant execute on function public.get_decrypted_vault_secret(uuid) to service_role;
