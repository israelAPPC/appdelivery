-- 0008_stores_public_read_policy.sql
-- Leitura publica de lojas ativas (correcao de review de seguranca)
--
-- Ate aqui, `stores` so tinha a policy `stores_select_own` (0001_init.sql),
-- que restringe a leitura a usuarios autenticados vinculados a loja via
-- store_users. Isso forcava o storefront publico (vitrine da loja, acessada
-- por visitantes anonimos em /loja/[slug]) a usar o client service_role
-- (bypass total de RLS) so para ler dados publicos da loja, o que viola
-- CLAUDE.md / .claude/rules/seguranca.md (nunca usar service_role para
-- servir dados a clientes).
--
-- Esta migration adiciona uma policy de SELECT adicional, permitindo que
-- qualquer visitante (anon ou authenticated) leia lojas com is_active = true.
-- RLS combina policies do mesmo comando (SELECT) com OR, entao:
--   - dono/funcionario continua enxergando a propria loja mesmo se
--     is_active = false (via stores_select_own);
--   - qualquer anonimo enxerga apenas lojas ativas (via esta nova policy).
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras devem ser feitas em novas migrations.

create policy stores_select_public_active
  on public.stores
  for select
  to anon, authenticated
  using (is_active = true);
