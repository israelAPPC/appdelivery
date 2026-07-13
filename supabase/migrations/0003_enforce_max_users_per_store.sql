-- 0003_enforce_max_users_per_store.sql
-- Corrige condicao de corrida (TOCTOU) no limite de "maximo 3 usuarios por loja"
-- (achado de code review): a rota app/api/auth/invite/route.ts validava esse
-- limite apenas na aplicacao (SELECT count antes do INSERT), sem nenhuma
-- trava no banco. Duas requisicoes de convite concorrentes para a mesma loja
-- podiam furar o limite, pois cada uma le a contagem antes de qualquer commit.
--
-- Correcao:
--   Trigger BEFORE INSERT em public.store_users que:
--     1. Adquire um advisory lock transacional por store_id
--        (pg_advisory_xact_lock(hashtext(store_id::text))), serializando
--        quaisquer transacoes concorrentes que tentem inserir store_users
--        para a MESMA loja. O lock e liberado automaticamente no fim da
--        transacao (commit ou rollback).
--     2. So entao conta quantos store_users ja existem para aquele store_id
--        e rejeita o insert via RAISE EXCEPTION se o resultado for >= 3.
--
-- Isso move a regra de negocio "maximo 3 usuarios por loja" para dentro do
-- banco, eliminando a janela de corrida que existia so na camada de
-- aplicacao.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras devem ser feitas em novas migrations
-- (0004_..., etc).

create or replace function public.enforce_max_users_per_store()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
begin
  -- Serializa transacoes concorrentes que tentem inserir store_users para a
  -- mesma loja: a segunda transacao so prossegue (e conta) depois que a
  -- primeira commitar ou fizer rollback, eliminando o TOCTOU do "SELECT
  -- count antes do INSERT" feito na aplicacao.
  perform pg_advisory_xact_lock(hashtext(new.store_id::text));

  select count(*)
  into existing_count
  from public.store_users
  where store_id = new.store_id;

  if existing_count >= 3 then
    raise exception 'Limite de 3 usuarios por loja atingido'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_max_users_per_store() is
  'Impede, dentro da propria transacao (via advisory lock por store_id), que uma loja ultrapasse o limite de 3 usuarios vinculados, mesmo sob insercoes concorrentes.';

drop trigger if exists enforce_max_users_per_store_trigger on public.store_users;

create trigger enforce_max_users_per_store_trigger
  before insert on public.store_users
  for each row
  execute function public.enforce_max_users_per_store();
