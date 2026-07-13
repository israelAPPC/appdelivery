-- 0005_store_shipping_and_logo_storage.sql
-- Configuracao da loja: frete + storage de logo (Task 2.2)
--
-- A tabela `stores` (0001_init.sql) ja possui `logo_url` e `opening_hours`.
-- Esta migration adiciona apenas os campos de frete que ainda faltam
-- (`free_radius_km`, `price_per_km`), com CHECK constraints garantindo que,
-- quando informados, nunca sejam negativos (CLAUDE.md / skill calculo-frete).
--
-- Tambem cria o bucket de Storage `store-logos`, publico para leitura (o
-- logo aparece no manifest do PWA do storefront, sem autenticacao), mas
-- com upload/update/delete restritos ao admin da propria loja.
--
-- IMPORTANTE: esta migration, uma vez aplicada em producao, nunca deve ser
-- alterada. Mudancas futuras devem ser feitas em novas migrations.

-- =========================================================================
-- Colunas de frete em stores
-- =========================================================================
alter table public.stores
  add column if not exists free_radius_km numeric,
  add column if not exists price_per_km numeric;

comment on column public.stores.free_radius_km is 'Raio (em km) dentro do qual a entrega e gratuita. Null = nao configurado. Ver skill calculo-frete.';
comment on column public.stores.price_per_km is 'Preco cobrado por km excedente ao raio gratis. Null = nao configurado (entrega fora do raio gratis fica indisponivel). Ver skill calculo-frete.';

alter table public.stores
  add constraint stores_free_radius_km_non_negative
  check (free_radius_km is null or free_radius_km >= 0);

alter table public.stores
  add constraint stores_price_per_km_non_negative
  check (price_per_km is null or price_per_km >= 0);

-- =========================================================================
-- Storage: bucket de logos de loja
-- =========================================================================
-- Convencao de path do objeto: "<store_id>/<arquivo>", usada pelas policies
-- abaixo para restringir escrita ao admin da propria loja (primeiro segmento
-- do path = store_id).
insert into storage.buckets (id, name, public)
values ('store-logos', 'store-logos', true)
on conflict (id) do nothing;

-- Leitura publica (necessaria para o manifest do PWA / storefront do cliente,
-- que nao exige autenticacao).
create policy store_logos_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'store-logos');

-- Apenas admin da propria loja pode inserir/atualizar/remover o logo dela
-- (path do objeto comeca com "<store_id>/").
create policy store_logos_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-logos'
    and public.is_store_admin(((storage.foldername(name))[1])::uuid)
  );

create policy store_logos_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-logos'
    and public.is_store_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'store-logos'
    and public.is_store_admin(((storage.foldername(name))[1])::uuid)
  );

create policy store_logos_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-logos'
    and public.is_store_admin(((storage.foldername(name))[1])::uuid)
  );
