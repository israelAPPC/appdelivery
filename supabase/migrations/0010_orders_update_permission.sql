-- 0010_orders_update_permission.sql
-- Corrige achado de seguranca (revisao de codigo Fase 3): a policy
-- `orders_update_own_store` (0009_orders.sql) permitia UPDATE para QUALQUER
-- usuario vinculado a loja, sem checar a permissao granular `orders` de
-- `store_users.permissions`. Um funcionario com `permissions.orders = false`
-- conseguia dar UPDATE em pedidos via API direta do Supabase, contornando a
-- checagem que so existia no route handler do painel.
--
-- Nao edita a migration 0009 (ja aplicada) — cria uma nova policy substituta.
--
-- Esta policy so afeta o client autenticado (painel). O webhook do Mercado
-- Pago (Fase 4) e o checkout usam o client `service_role`, que ignora RLS
-- por definicao — fluxo nao afetado.

-- =========================================================================
-- Funcao auxiliar (SECURITY DEFINER): usuario pertence a loja E tem
-- permissao de gerenciar pedidos (admin sempre tem; employee somente se
-- `permissions.orders = true`).
-- =========================================================================
create or replace function public.current_user_can_manage_orders(target_store_id uuid)
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
      and (
        role = 'admin'
        or coalesce((permissions ->> 'orders')::boolean, false)
      )
  );
$$;

comment on function public.current_user_can_manage_orders(uuid) is
  'Verifica se o usuario autenticado atual pode gerenciar pedidos da loja informada: admin sempre pode; employee somente se permissions.orders = true.';

-- =========================================================================
-- Policy de UPDATE de orders: substitui orders_update_own_store (0009),
-- agora exigindo permissao granular de orders.
-- =========================================================================
drop policy if exists orders_update_own_store on public.orders;

create policy orders_update_own_store_with_permission
  on public.orders
  for update
  to authenticated
  using (public.current_user_can_manage_orders(store_id))
  with check (public.current_user_can_manage_orders(store_id));
