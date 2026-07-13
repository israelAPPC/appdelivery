---
# DeliveryPróprio
> PWA de pedidos white-label para lanchonetes, bares e restaurantes: cada loja tem seu próprio app instalável, sem taxa por venda — só mensalidade fixa.

## Sobre este arquivo
Este é o equivalente do `CLAUDE.md` para o OpenCode. Mesma fonte de verdade (`SPEC.md`/`PLAN.md`), mesmas regras — só o formato de agents/commands muda (`.opencode/` em vez de `.claude/`).

## Divisão de trabalho Claude Code x OpenCode
Use o OpenCode para tasks mecânicas/de menor risco, rodando um provedor de modelo gratuito (Ollama local, ou free tier de Groq/OpenRouter, configurado em `opencode.json`). Mantenha no Claude Code (via agent `orquestrador`) tudo que envolve: arquitetura, RLS/multi-tenant, pagamentos/webhook, criptografia de credenciais — esses domínios têm regras de segurança explícitas que exigem mais cuidado do que um modelo gratuito tende a aplicar de forma consistente.

## Orquestração
Assim como no Claude Code, toda solicitação de implementação deve passar pelo agent `orquestrador` (`.opencode/agents/orquestrador.md`), que decide qual sub-agent aciona. Não implemente diretamente uma task que pertença ao domínio de um sub-agent especializado.

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
├── CLAUDE.md / AGENTS.md     # contexto para agents (Claude Code / OpenCode)
├── PLAN.md                  # sprints/fases/tasks
├── .claude/                 # agents, commands, hooks, rules, skills, squads (Claude Code)
├── .opencode/                # agents, commands (OpenCode)
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

Variáveis de ambiente necessárias: ver `.env.example`.

## Padrões de código
- Nomenclatura de arquivos: kebab-case para arquivos e pastas (`order-card.tsx`, `calculate-shipping.ts`)
- Nomenclatura de variáveis e funções: camelCase; funções de cálculo/regra de negócio com nome descritivo do que fazem (`calculateShippingCost`, não `calc`)
- Estrutura de endpoints: route handlers em `app/api/<recurso>/route.ts`, um recurso por pasta, verbos HTTP como exports nomeados (`GET`, `POST`)
- Estrutura de componentes: um componente por arquivo, colocalizado com a rota que o usa quando não é compartilhado; componentes compartilhados em `app/components/`
- Tipagem: TypeScript estrito (`strict: true`), sem `any`

## TDD
- Framework: Vitest (+ Testing Library para componentes)
- Onde ficam os testes: `tests/`, espelhando a estrutura de `app/`
- Regra: nenhuma lógica de negócio é implementada sem teste antes
- Testes críticos deste projeto:
  - [ ] Pedido dentro do raio grátis → frete = 0
  - [ ] Pedido fora do raio → frete = distância_km × preço_km
  - [ ] Webhook de pagamento aprovado (Mercado Pago) → status do pedido muda para "pago"
  - [ ] Webhook duplicado (reenvio) → não duplica o pedido nem o pagamento (idempotência)
  - [ ] Pedido "pagar na entrega" → status inicial correto, sem chamada ao Mercado Pago
  - [ ] Cupom aplicado → total recalculado corretamente
  - [ ] Funcionário com acesso restrito não consegue acessar seção bloqueada (RLS/permissão)

## Nunca fazer
- Nunca armazenar dados de cartão de crédito diretamente
- Nunca liberar dados de uma loja para outra — toda query passa por RLS filtrando por `store_id`
- Nunca marcar um pedido como "pago" sem validar a assinatura do webhook do Mercado Pago
- Nunca armazenar chave de API de integração em texto plano no banco

## Decisões em aberto
- [ ] Fluxo de cobrança da mensalidade da assinatura
- [ ] Especificação completa do programa de fidelização (pós-MVP)
---
