-- 0014_product_reviews.sql
-- Avaliacoes de produto por estrelas, pos-entrega (Task 5.1)
--
-- Assim como `orders`/`push_subscriptions`, o cliente final NAO tem login
-- no MVP (ver SPEC.md) — ele so sabe o `order_id` do proprio pedido. A
-- avaliacao so pode ser criada depois que o pedido correspondente estiver
-- com `status = 'concluido'`, e o produto avaliado precisa estar entre os
-- itens daquele pedido (`orders.items[].productId`). Toda essa validacao de
-- regra de negocio acontece no route handler
-- (`app/api/products/[id]/reviews/route.ts`), usando o client `service_role`
-- (`createSupabaseAdminClient`) para inserir — por isso NAO existe policy de
-- INSERT/UPDATE/DELETE para `anon`/`authenticated` nesta tabela.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras de schema/policies devem ser feitas em novas
-- migrations (0015_..., etc).

-- =========================================================================
-- Tabela: product_reviews
-- =========================================================================
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- Um mesmo pedido nunca pode gerar mais de uma avaliacao para o mesmo
  -- produto (evita spam/duplicidade do mesmo cliente sobre o mesmo item).
  constraint product_reviews_order_id_product_id_key unique (order_id, product_id)
);

comment on table public.product_reviews is 'Avaliacoes por estrelas (1-5) de produtos, feitas pelo cliente final apos o pedido ser concluido. Nunca inserida diretamente pelo client — sempre via service_role no route handler, apos validar que o pedido esta concluido e que o produto pertence a ele.';
comment on column public.product_reviews.order_id is 'Pedido que originou a avaliacao. So pode existir avaliacao se orders.status = ''concluido'' no momento da criacao (validado no backend, nao no banco).';
comment on column public.product_reviews.rating is 'Nota de 1 a 5 estrelas.';

create index if not exists product_reviews_product_id_idx on public.product_reviews (product_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.product_reviews enable row level security;

-- Leitura publica: a media de estrelas e a lista de avaliacoes sao exibidas
-- na vitrine publica do storefront (sem autenticacao).
create policy product_reviews_select_public
  on public.product_reviews
  for select
  using (true);

-- Nao existe policy de INSERT/UPDATE/DELETE para `anon`/`authenticated`: a
-- criacao de avaliacao e feita exclusivamente pelo route handler
-- `app/api/products/[id]/reviews/route.ts`, que usa o client `service_role`
-- (ignora RLS por definicao) apos validar todas as regras de negocio no
-- backend. Isso evita que o cliente final (sem sessao) escreva diretamente
-- na tabela com valores arbitrarios ou avalie sem pedido concluido.
