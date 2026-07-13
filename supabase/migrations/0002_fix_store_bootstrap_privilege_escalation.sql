-- 0002_fix_store_bootstrap_privilege_escalation.sql
-- Corrige brecha de escalonamento de privilegio no bootstrap de store_users
-- (achado de code review da Task 1.1) + idempotencia dos triggers de updated_at.
--
-- Problema corrigido:
--   A policy `store_users_insert_bootstrap_or_admin` (0001) permitia que
--   QUALQUER usuario autenticado se auto-inserisse como admin de uma loja
--   recem-criada por outra pessoa, enquanto essa loja ainda nao tivesse
--   nenhum store_users vinculado (`not store_has_users(store_id)`). Isso
--   abria uma janela de corrida / escalonamento de privilegio: bastava
--   descobrir o store_id de uma loja recem-criada antes do fluxo legitimo
--   (insert do admin) terminar.
--
-- Correcao:
--   - Nova funcao RPC SECURITY DEFINER `create_store_with_owner(store_data)`
--     que cria a loja E vincula o CHAMADOR (auth.uid() capturado no inicio
--     da mesma transacao/chamada) como admin, atomicamente. Nao existe mais
--     nenhuma janela em que a loja exista sem seu admin vinculado por essa via.
--   - A policy de insert "livre" (bootstrap) em store_users e removida e
--     substituida por uma policy que so permite insert direto do client
--     quando o usuario ja e admin da loja (i.e. para adicionar outros
--     membros). O vinculo do PRIMEIRO admin de uma loja passa a ser feito
--     exclusivamente pela RPC acima.
--   - Insert direto em `stores` continua permitido para qualquer usuario
--     autenticado (nao e, por si so, uma escalada de privilegio: sem a
--     policy antiga de bootstrap livre em store_users, uma loja criada
--     dessa forma simplesmente fica sem vinculo de admin ate alguem com
--     privilegio de admin criar o vinculo, o que na pratica so acontece
--     via a RPC).
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0003_..., etc).

-- =========================================================================
-- RPC de bootstrap atomico: cria a loja e vincula seu criador como admin
-- na MESMA transacao, usando auth.uid() capturado no momento da chamada.
-- =========================================================================

create or replace function public.create_store_with_owner(store_data jsonb)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  new_store public.stores;
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'create_store_with_owner: requer usuario autenticado (auth.uid() nulo)';
  end if;

  insert into public.stores (
    name,
    slug,
    address_street,
    address_number,
    address_neighborhood,
    address_city,
    address_state,
    address_zip_code,
    address_latitude,
    address_longitude,
    logo_url,
    phone,
    whatsapp_number,
    opening_hours,
    is_active
  )
  values (
    store_data->>'name',
    store_data->>'slug',
    store_data->>'address_street',
    store_data->>'address_number',
    store_data->>'address_neighborhood',
    store_data->>'address_city',
    store_data->>'address_state',
    store_data->>'address_zip_code',
    (store_data->>'address_latitude')::double precision,
    (store_data->>'address_longitude')::double precision,
    store_data->>'logo_url',
    store_data->>'phone',
    store_data->>'whatsapp_number',
    coalesce(store_data->'opening_hours', '{}'::jsonb),
    coalesce((store_data->>'is_active')::boolean, true)
  )
  returning * into new_store;

  -- Vincula o CHAMADOR (auth.uid() capturado acima, no inicio desta mesma
  -- transacao) como admin da loja recem-criada. Nunca usa um user_id vindo
  -- do payload do client.
  insert into public.store_users (store_id, user_id, role)
  values (new_store.id, current_uid, 'admin');

  return new_store;
end;
$$;

comment on function public.create_store_with_owner(jsonb) is
  'Cria uma loja e vincula o usuario autenticado chamador (auth.uid()) como seu admin, atomicamente, eliminando a janela de corrida do bootstrap antigo via policy. Unico caminho suportado para o vinculo do primeiro admin de uma loja.';

-- Apenas usuarios autenticados podem chamar; anon nunca deve conseguir criar lojas.
revoke all on function public.create_store_with_owner(jsonb) from public;
grant execute on function public.create_store_with_owner(jsonb) to authenticated;

-- =========================================================================
-- Substitui a policy de insert "bootstrap livre" de store_users pela
-- versao que exige que o chamador ja seja admin da loja.
-- =========================================================================

drop policy if exists store_users_insert_bootstrap_or_admin on public.store_users;
drop policy if exists store_users_insert_admin_only on public.store_users;

create policy store_users_insert_admin_only
  on public.store_users
  for insert
  to authenticated
  with check (public.is_store_admin(store_id));

comment on policy store_users_insert_admin_only on public.store_users is
  'Insert direto (fora da RPC create_store_with_owner) so e permitido para um admin ja existente da loja adicionar outros membros. O vinculo do PRIMEIRO admin de uma loja e feito exclusivamente por create_store_with_owner(jsonb), eliminando a janela de corrida do bootstrap "livre" anterior.';

-- =========================================================================
-- Idempotencia dos triggers de updated_at (defensivo: permite reaplicar
-- esta migration sem erro de "trigger already exists").
-- =========================================================================

drop trigger if exists set_updated_at_stores on public.stores;
create trigger set_updated_at_stores
  before update on public.stores
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_updated_at_store_users on public.store_users;
create trigger set_updated_at_store_users
  before update on public.store_users
  for each row
  execute function public.set_updated_at();
