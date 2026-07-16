# PLAN.md

## Sprint 1 — Uma loja de teste completa: cliente monta pedido, paga (online ou na entrega), lojista vê e imprime o pedido em tempo real
> Critério verificável: `npm run test` passa 100% e existe um fluxo end-to-end manual documentado em `tests/e2e/checkout.md` concluído sem erros.

### Fase 1 — Fundação (schema, auth, infra)
> Dependências: nenhuma
> Paralelismo: Task 1.1, 1.2 e 1.3 rodam em paralelo (schemas distintos, sem dependência entre si)

#### Task 1.1 — Schema base + RLS multi-tenant
- Agent: backend-db
- Input: SPEC.md (módulos 1, 2, 4, 7), CLAUDE.md (padrões de nomenclatura)
- Output: `supabase/migrations/0001_init.sql` com tabelas `stores`, `users`, `store_users` (papel + permissões JSON), políticas RLS filtrando por `store_id` em todas as tabelas
- Testes críticos:
  - [x] Usuário da loja A não consegue ler/escrever linha de `store_users` da loja B (RLS bloqueia)
  - [x] Usuário da loja A não consegue ler diretamente uma linha de `stores` da loja B por id (RLS bloqueia)
  - [x] Usuário autenticado não consegue se auto-inserir como admin de uma loja recém-criada por outro usuário (escalonamento de privilégio bloqueado — bootstrap só via `create_store_with_owner`)
  - [x] Query sem `store_id` no contexto de auth retorna 0 linhas, nunca erro 500
- Atenção para Task 1.2/2.2: a policy `stores_insert_authenticated` ainda permite insert direto em `stores` fora da RPC `create_store_with_owner`, o que pode criar loja "órfã" sem admin vinculado. Todo fluxo de cadastro de loja (Task 1.2/2.2) deve chamar exclusivamente `create_store_with_owner`, nunca inserir direto na tabela `stores`.
- Nota: a Task 1.1 não cria a tabela `orders` (isso é escopo da Task 3.2, quando o checkout é implementado). O teste crítico de RLS cross-tenant em `orders` ("usuário da loja A não consegue ler/escrever linha de `orders` da loja B") é responsabilidade da Task 3.2, e deve ser escrito lá quando a tabela existir — não faz parte do critério de conclusão desta task.

#### Task 1.2 — Auth & permissões por checkbox
- Agent: backend-auth
- Input: Task 1.1 concluída (tabela `store_users`)
- Output: `app/lib/auth.ts` (helpers `getSession`, `getStorePermissions`), `app/api/auth/*/route.ts`
- Testes críticos:
  - [x] Login de funcionário com `permissions: {orders: true, catalog: false}` bloqueia acesso à rota de catálogo (via `getStorePermissions`; teste de bloqueio fim a fim na rota de catálogo fica pendente para a Fase 2, quando a rota existir)
  - [x] Admin sempre tem acesso total independente de `permissions`
- Decisão (2026-07-13): convite de funcionário usa fluxo de e-mail (`supabase.auth.admin.inviteUserByEmail`) — o funcionário cria a própria senha via link recebido, o admin nunca define/conhece a senha de outro usuário.

#### Task 1.3 — Setup Next.js + Vercel + Supabase client
- Agent: infra
- Input: CLAUDE.md (stack, estrutura de pastas)
- Output: projeto Next.js configurado, `app/lib/supabase.ts` (client/server), `.env.example`, deploy inicial na Vercel
- Testes críticos:
  - [ ] `GET /api/health` retorna 200
  - [ ] Build de produção (`next build`) conclui sem erros

### Fase 2 — Catálogo, loja e storefront
> Dependências: Fase 1
> Paralelismo: Task 2.1, 2.2, 2.3 e 2.4 rodam em paralelo

#### Task 2.1 — CRUD de produtos e catálogo
- Agent: backend-catalog
- Input: Fase 1 concluída
- Output: `app/api/products/route.ts` (GET/POST), `app/api/products/[id]/route.ts` (PATCH/DELETE), tabela `products` (nome, preço, categoria, foto, disponível)
- Testes críticos:
  - [x] Criar produto com preço negativo é rejeitado (400)
  - [x] Produto marcado `disponivel: false` não aparece na listagem pública do storefront

#### Task 2.2 — Configuração da loja (dados, logo, frete)
- Agent: backend-store
- Input: Fase 1 concluída
- Output: `app/api/store/route.ts` (GET/PATCH), tabela `stores` com campos `free_radius_km`, `price_per_km`, `logo_url`, horário de funcionamento
- Testes críticos:
  - [x] Upload de logo salva URL válida no Supabase Storage
  - [x] `free_radius_km` e `price_per_km` aceitam apenas valores numéricos positivos

#### Task 2.3 — PWA Storefront + manifest dinâmico
- Agent: frontend-storefront
- Input: Fase 1 concluída (dados de loja mockados até Task 2.2 terminar)
- Output: `app/(storefront)/loja/[slug]/page.tsx`, `app/(storefront)/loja/[slug]/manifest.json/route.ts` (gera manifest com nome/ícone da loja)
- Testes críticos:
  - [x] `manifest.json` de loja com logo cadastrada retorna `icons` apontando para a logo correta
  - [x] Loja sem logo cadastrada usa ícone padrão do sistema (fallback, sem quebrar o manifest)

#### Task 2.4 — Central de credenciais de integração da loja
- Agent: backend-store
- Input: Task 1.1 concluída (schema base)
- Output: `supabase/migrations/000X_store_credentials.sql` (tabela `store_credentials`: `store_id`, `provider` (`mercado_pago` | `whatsapp`), `encrypted_value`, `created_at`), `app/api/store/credentials/route.ts` (POST para salvar, GET que retorna apenas status "configurada"/"não configurada" + últimos 4 caracteres), UI em `app/(admin)/configuracoes/integracoes/page.tsx`
- Testes críticos:
  - [x] Chave salva nunca é retornada em texto plano por nenhuma rota GET
  - [x] Loja sem `mercado_pago` configurado não consegue habilitar pagamento "pagar agora" no checkout (implementado como `hasProviderConfigured(storeId, provider)` em `app/lib/store-credentials.ts`, para a Task 3.2 consumir)

### Fase 3 — Carrinho, frete, checkout e painel de pedidos
> Dependências: Fase 2
> Paralelismo: Task 3.1, 3.2 e 3.3 rodam em paralelo

#### Task 3.1 — Carrinho + cálculo de frete
- Agent: frontend-storefront
- Input: Task 2.1, 2.2, 2.3 concluídas
- Output: `app/lib/calculate-shipping.ts` (função pura), UI de carrinho em `app/(storefront)/loja/[slug]/carrinho/page.tsx`
- Testes críticos:
  - [ ] Endereço dentro do `free_radius_km` → frete = 0
  - [ ] Endereço fora do raio → frete = distância_km × `price_per_km`

#### Task 3.2 — Checkout: Mercado Pago + pagar na entrega/retirada
- Agent: backend-payments
- Input: Task 2.1, 2.2, 2.4 concluídas
- Output: `app/api/checkout/route.ts` (cria pedido + preferência de pagamento MP usando a credencial própria da loja lida/descriptografada de `store_credentials`, quando aplicável), tabela `orders` com `payment_method` (`mp_online` | `on_delivery`), `payment_status`, `fulfillment_type` (`delivery` | `pickup`)
- Testes críticos:
  - [ ] Pedido "pagar na entrega" é criado com `payment_status: pending_offline` sem chamar API do Mercado Pago
  - [ ] Pedido "pagar agora" gera link de preferência do Checkout Pro usando a credencial da própria loja (não uma chave global), com valor total correto (produtos + frete − cupom)

#### Task 3.3 — Painel de pedidos em tempo real
- Agent: frontend-admin
- Input: Task 1.2 concluída, tabela `orders` existente (pode iniciar com mock até 3.2 terminar)
- Output: `app/(admin)/pedidos/page.tsx`, subscription Supabase Realtime na tabela `orders` filtrada por `store_id`
- Testes críticos:
  - [ ] Novo pedido inserido no banco aparece no painel sem reload de página
  - [ ] Mudança de status (`preparo` → `entrega`) é refletida em tempo real para todos os usuários da loja logados

### Fase 4 — Confirmação de pagamento, impressão e notificação
> Dependências: Fase 3
> Paralelismo: Task 4.1, 4.2 e 4.3 rodam em paralelo

#### Task 4.1 — Webhook Mercado Pago
- Agent: backend-payments
- Input: Task 3.2 concluída
- Output: `app/api/webhooks/mercado-pago/route.ts` com validação de assinatura e idempotência
- Testes críticos:
  - [ ] Webhook de pagamento aprovado muda `orders.payment_status` para `paid`
  - [ ] Reenvio do mesmo webhook (mesmo `payment_id`) não duplica atualização nem gera efeito colateral duplo

#### Task 4.2 — Impressão de comanda
- Agent: frontend-admin
- Input: Task 3.2, 3.3 concluídas
- Output: `app/(admin)/pedidos/[id]/imprimir/page.tsx` (layout print-friendly com CSS `@media print`)
- Testes críticos:
  - [ ] Comanda renderiza nome da loja, nº do pedido, itens, cliente, endereço (se entrega), forma de pagamento e status pago/a pagar
  - [ ] Pedido de retirada não exibe campo de endereço de entrega

#### Task 4.3 — Notificação push (status do pedido)
- Agent: backend-notifications
- Input: Task 3.3 concluída, ferramenta de push definida (decisão em aberto no CLAUDE.md)
- Output: `app/lib/notifications.ts`, disparo automático ao mudar `orders.status`
- Testes críticos:
  - [ ] Mudança de status dispara 1 notificação (não duplicada) para o cliente do pedido
  - [ ] Falha no provedor de push não derruba a atualização de status do pedido (não bloqueante)

### Fase 6 — Landing page pública + onboarding de lojista

#### Task 6.1 — Landing page (`/`) + fluxo de cadastro da loja
- Agent: frontend-admin
- Input: `SPEC.md` (posicionamento B2B, funcionalidades essenciais), `DESIGN.md` (tokens), `POST /api/auth/signup` já existente (cria loja+admin via `create_store_with_owner` e retorna `session`)
- Output:
  - `app/page.tsx` — landing B2B para lojistas: Hero (mensalidade fixa, sem taxa por venda vs. iFood/WhatsApp), Funcionalidades essenciais, Como funciona (passos), CTA de cadastro. Só tokens de `DESIGN.md`, dark mode funcionando, sem preços (cobrança da assinatura é decisão em aberto)
  - `app/(marketing)/cadastro/page.tsx` (ou equivalente) — formulário (nome da loja, e-mail, senha, dados básicos) que faz POST a `/api/auth/signup`, grava `app_delivery_store_id` + `app_delivery_access_token` no `localStorage` e redireciona para `/pedidos`
  - `app/lib/signup-form.ts` — validação pura do formulário + geração de slug a partir do nome da loja (com testes)
- Sem cobrança de mensalidade (decisão em aberto mantida). Reaproveita o endpoint de signup existente — não duplica lógica de criação de loja/usuário.
- Testes críticos:
  - [ ] Validação rejeita e-mail inválido, senha < 6 e nome de loja vazio (400 antes de chamar a API)
  - [ ] Slug é gerado em kebab-case, sem acento/caractere especial, a partir do nome da loja
  - [ ] Cadastro com sucesso persiste token+storeId e redireciona ao painel

---

## Sprint 2 — Recursos complementares (avaliações, cupons, relatórios, WhatsApp, comanda avançada)
> Critério verificável: cada feature abaixo tem teste passando e é demonstrável isoladamente.

### Fase 5 — Engajamento e monetização
> Dependências: Sprint 1 completo
> Paralelismo: Task 5.1, 5.2, 5.3, 5.4 rodam todas em paralelo (módulos isolados)

#### Task 5.1 — Avaliação de produtos por estrelas
- Agent: fullstack-engagement
- Output: tabela `product_reviews`, componente de avaliação no storefront pós-entrega
- Testes críticos:
  - [ ] Cliente só pode avaliar produto de pedido concluído
  - [ ] Média de estrelas recalculada corretamente ao adicionar nova avaliação

#### Task 5.2 — Cupons de desconto
- Agent: backend-catalog
- Output: tabela `coupons`, validação no checkout (Task 3.2)
- Testes críticos:
  - [ ] Cupom expirado é rejeitado no checkout
  - [ ] Cupom de frete grátis zera o valor do frete sem alterar total dos produtos

#### Task 5.3 — Botão WhatsApp no pedido
- Agent: frontend-storefront
- Output: componente `WhatsappOrderButton` gerando link `wa.me/<numero_loja>?text=Pedido%20%23<id>`
- Testes críticos:
  - [ ] Link gerado contém o número da loja e o número do pedido corretos
  - [ ] Loja sem número de WhatsApp cadastrado oculta o botão (não gera link quebrado)

#### Task 5.4 — Relatório financeiro básico
- Agent: backend-reports
- Output: `app/(admin)/financeiro/page.tsx`, `app/api/reports/sales/route.ts` (filtro por período e forma de pagamento)
- Testes críticos:
  - [x] Filtro "última semana" soma apenas pedidos `payment_status: paid` no intervalo correto
  - [x] Segmentação por forma de pagamento bate com a soma total do período

---

## Resumo de paralelismo
- **Fase 1**: 3 tasks em paralelo (3 agents: backend-db, backend-auth, infra)
- **Fase 2**: 3 tasks em paralelo (3 agents: backend-catalog, backend-store, frontend-storefront)
- **Fase 3**: 3 tasks em paralelo (3 agents: frontend-storefront, backend-payments, frontend-admin)
- **Fase 4**: 3 tasks em paralelo (3 agents: backend-payments, frontend-admin, backend-notifications)
- **Fase 5**: 4 tasks em paralelo (4 agents: fullstack-engagement, backend-catalog, frontend-storefront, backend-reports)

**Total de agents especializados necessários: 8** (backend-db, backend-auth, infra, backend-catalog, backend-store, frontend-storefront, backend-payments, frontend-admin, backend-notifications, backend-reports, fullstack-engagement — alguns reaproveitados entre fases, contagem única de papéis: 10).
