---
# DeliveryPróprio
> PWA de pedidos white-label para lanchonetes, bares e restaurantes: cada loja tem seu próprio app instalável, sem taxa por venda — só mensalidade fixa.

## Orquestração
Toda solicitação do usuário neste projeto deve ser roteada pelo agent `orquestrador` (`.claude/agents/orquestrador.md`), que decide quais sub-agents especialistas acionar, monta o plano de implementação e o mapa de paralelismo antes de delegar. Não implemente diretamente uma task que pertença ao domínio de um sub-agent especializado — delegue via orquestrador.

## Stack
| Camada | Tecnologia |
|--------|------------|
| Frontend + Backend | Next.js (App Router) |
| Banco de dados / Auth / Realtime / Storage | Supabase |
| Hosting | Vercel |
| Pagamento | Mercado Pago Checkout Pro |
| Notificação push | Web Push API nativa (VAPID) via lib `web-push` |
| Geocodificação / distância | OpenRouteService (gratuito, sem cartão de crédito, 2000 req/dia) |
| Multi-tenant | path por loja (`/loja/[slug]`) |
| Criptografia de credenciais por loja | Supabase Vault (pgsodium) |

## Estrutura de pastas
```
app-delivery/
├── SPEC.md                  # especificação funcional do projeto
├── CLAUDE.md                # este arquivo — contexto para agents
├── PLAN.md                  # sprints/fases/tasks (gerado na etapa seguinte)
├── .claude/squads/          # squads de agents especializados (bundles de terceiros, formato squad.yaml)
├── app/                     # aplicação Next.js
│   ├── (admin)/              # painel do lojista/funcionário (responsivo)
│   ├── (storefront)/         # PWA do cliente, por loja
│   ├── api/                  # route handlers (checkout, webhook MP, manifest dinâmico)
│   └── lib/                  # clientes Supabase, cálculo de frete, utils
├── supabase/
│   ├── migrations/           # migrations SQL + policies de RLS
│   └── seed.sql               # dados de exemplo para dev
├── tests/                    # testes espelhando a estrutura de app/
├── public/                   # assets estáticos (ícones padrão, manifest base)
└── .env.example
```

## Como rodar localmente
**Backend/DB (Supabase local):**
```bash
supabase start
supabase db reset
```

**Frontend/App (Next.js):**
```bash
npm install
npm run dev
```

Variáveis de ambiente necessárias: ver `.env.example` (Supabase URL/keys, credenciais Mercado Pago sandbox).

## Padrões de código
- Nomenclatura de arquivos: kebab-case para arquivos e pastas (`order-card.tsx`, `calculate-shipping.ts`)
- Nomenclatura de variáveis e funções: camelCase; funções de cálculo/regra de negócio com nome descritivo do que fazem (`calculateShippingCost`, não `calc`)
- Estrutura de endpoints: route handlers em `app/api/<recurso>/route.ts`, um recurso por pasta, verbos HTTP como exports nomeados (`GET`, `POST`)
- Estrutura de componentes: um componente por arquivo, colocalizado com a rota que o usa quando não é compartilhado; componentes compartilhados em `app/components/`
- Tipagem: TypeScript estrito (`strict: true`), sem `any` — tipos gerados a partir do schema do Supabase quando possível

## TDD
- Framework backend: Vitest
- Framework frontend: Vitest + Testing Library
- Onde ficam os testes: `tests/`, espelhando a estrutura de `app/`
- Regra: nenhuma lógica de negócio (cálculo de frete, cupom, total do pedido) é implementada sem teste antes
- Testes críticos deste projeto:
  - [ ] Pedido dentro do raio grátis → frete = 0
  - [ ] Pedido fora do raio → frete = distância_km × preço_km
  - [ ] Webhook de pagamento aprovado (Mercado Pago) → status do pedido muda para "pago"
  - [ ] Webhook duplicado (reenvio) → não duplica o pedido nem o pagamento (idempotência)
  - [ ] Pedido "pagar na entrega" → status inicial correto, sem chamada ao Mercado Pago
  - [ ] Cupom aplicado → total recalculado corretamente (percentual, valor fixo, frete grátis)
  - [ ] Funcionário com acesso restrito não consegue acessar seção bloqueada (RLS/permissão)

## Nunca fazer
- Nunca armazenar dados de cartão de crédito diretamente — todo pagamento online passa pelo Checkout Pro do Mercado Pago
- Nunca liberar dados de uma loja para outra — toda query passa por Row Level Security (RLS) filtrando por `tenant_id`/`store_id`
- Nunca marcar um pedido como "pago" sem validar a assinatura/autenticidade do webhook do Mercado Pago
- Nunca armazenar chave de API de integração (Mercado Pago, WhatsApp, etc.) em texto plano no banco — sempre criptografada, e nunca retornada em texto plano por nenhuma rota de leitura (apenas indicar "configurada"/"não configurada" e os últimos 4 caracteres, se necessário exibir algo)

## Decisões em aberto
- [ ] Fluxo de cobrança da mensalidade da assinatura
- [ ] Especificação completa do programa de fidelização (pós-MVP)
---
