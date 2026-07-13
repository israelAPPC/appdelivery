# SPEC.md

## Problema
Plataformas de delivery como iFood e 99 cobram uma taxa sobre cada venda realizada, obrigando o lojista a embutir esse custo no preço final — o cliente paga mais caro pelo mesmo produto do que pagaria comprando diretamente na loja. Além disso, pedidos feitos por WhatsApp frequentemente se perdem ou atrasam (mensagens não lidas, fila desorganizada), gerando prejuízo e insatisfação.

Este sistema oferece a cada estabelecimento (lanchonete, bar, restaurante e similares) sua própria plataforma de pedidos via PWA, mediante uma mensalidade fixa — sem taxa por venda —, permitindo preços mais próximos dos praticados no balcão, e um fluxo de pedidos centralizado e confiável.

## Usuários
- **Lojista/Admin**: dono do estabelecimento, cadastra a loja, configura frete, catálogo, cupons, financeiro; acesso total.
- **Funcionário**: até 3 usuários adicionais por loja, cadastrados pelo admin. Por padrão têm acesso total, mas o admin pode restringir via checkboxes as seções visíveis: Pedidos, Catálogo/Produtos, Financeiro/Relatórios, Configurações da loja.
- **Cliente final**: consumidor que instala o PWA da loja (ícone com a logo do estabelecimento), navega o catálogo, faz pedidos, avalia produtos e acompanha status.

Painel do lojista/funcionário é responsivo: usável tanto em navegador desktop/notebook (uso comum dentro da loja) quanto em dispositivos móveis.

## Funcionalidades

### Essenciais
- Cadastro da loja (dados, endereço, logo, horário de funcionamento)
- Central de credenciais da loja: cada loja cadastra suas próprias chaves de integração (Mercado Pago Access Token/Public Key e, futuramente, WhatsApp) diretamente no painel — sem precisar de configuração manual no Vercel/Supabase por loja nova. Chaves armazenadas de forma criptografada, nunca em texto plano
- Autenticação multi-tenant com até 3 usuários por loja (admin + funcionários com permissões por checkbox)
- Catálogo de produtos (CRUD, categorias, disponibilidade, fotos)
- Carrinho de compras
- Checkout com duas formas de pagamento:
  - Pagar agora via Mercado Pago Checkout Pro
  - Pagar na entrega/retirada (dinheiro, cartão ou pix físico — apenas registra a preferência escolhida pelo cliente)
- Escolha entre entrega ou retirada no pedido
- Cálculo de frete: raio grátis configurável (km) ao redor do endereço da loja + preço por km rodado fora do raio (opcional, configurável pela loja)
- PWA instalável por loja, com manifest dinâmico exibindo a logo do estabelecimento como ícone do app
- Painel de pedidos em tempo real para o lojista/funcionário (novo → em preparo → saiu para entrega/pronto para retirada → concluído)
- Histórico de pedidos (cliente e loja)
- Avaliação de produtos por estrelas
- Cupons de desconto criados pela loja (percentual, valor fixo, frete grátis)
- Notificação push ao cliente sobre status do pedido (alternativa mais confiável ao OneSignal a definir — decisão em aberto)
- Botão de WhatsApp no pedido: abre `wa.me` com o número da loja e mensagem pré-preenchida contendo o número do pedido (sem chat interno)
- Relatório financeiro básico: total vendido por dia, semana, mês, ano ou filtro personalizado, segmentado por forma de pagamento (dinheiro, pix, cartão)
- Impressão de comanda/cupom do pedido: nome da loja, número do pedido, itens, nome do cliente, endereço de entrega (se aplicável), forma de pagamento (pago via Mercado Pago ou a pagar — com o meio escolhido: dinheiro/cartão/pix), e indicação de entrega ou retirada

### Fora do escopo
- Marketplace / busca entre lojas (cada loja tem seu próprio app isolado)
- Gestão de estoque/insumos
- Chat interno entre lojista e cliente (substituído pelo botão WhatsApp)
- Cobrança automática recorrente da mensalidade (pendência futura — cadastro/assinatura existe, mas o fluxo de cobrança será definido depois)
- Programa de fidelização (pontos, descontos por compra acumulada, produto grátis) — funcionalidade desejada, mas tratada como pós-MVP

## Módulos
1. **Auth & Multi-tenant** — login/cadastro do lojista e funcionários, isolamento de dados por loja, permissões por checkbox
2. **Gestão da Loja (Admin)** — dados da loja, logo, endereço, horário de funcionamento, configuração de frete, central de credenciais de integração (Mercado Pago e futuras)
3. **PWA do Cliente (Storefront)** — vitrine, carrinho, manifest.json dinâmico por loja
4. **Catálogo de Produtos** — CRUD de produtos, categorias, fotos, disponibilidade
5. **Checkout & Pagamento** — Mercado Pago Checkout Pro + fluxo de "pagar na entrega/retirada"
6. **Cálculo de Frete** — raio grátis configurável + preço por km fora do raio
7. **Gestão de Pedidos** — painel em tempo real, mudança de status, impressão de comanda
8. **Avaliações** — avaliação de produtos por estrelas
9. **Cupons** — criação e aplicação de cupons de desconto
10. **Notificações** — push de status de pedido ao cliente
11. **Relatórios Financeiros** — vendas por período e forma de pagamento
12. **Assinatura da Loja** *(estrutura de dados apenas — cobrança fica pendente)*

## Stack
- **Frontend/Backend**: Next.js (App Router) — escolhido para permitir geração dinâmica de manifest.json por loja via route handlers
- **Banco de dados / Auth / Realtime / Storage**: Supabase
- **Hosting**: Vercel
- **Pagamento**: Mercado Pago Checkout Pro
- **Notificação push**: a definir (alternativa ao OneSignal, que apresentou falhas de entrega em projeto anterior)

## Constraints técnicas
- Operar dentro dos limites do plano gratuito de Supabase e Vercel inicialmente; arquitetura preparada para migração para planos pagos sem retrabalho estrutural
- Multi-tenancy deve usar Row Level Security (RLS) no Supabase desde o início
- Painel do lojista deve ser responsivo (desktop e mobile)
- PWA deve gerar ícone/manifest dinâmico por loja (logo do estabelecimento)

## Critérios de aceitação
- [ ] Lojista consegue se cadastrar, configurar a loja e cadastrar produtos
- [ ] Cliente instala o PWA da loja e vê a logo da loja como ícone
- [ ] Cliente monta um pedido, escolhe entrega ou retirada, e escolhe pagar agora (Mercado Pago) ou pagar na entrega/retirada
- [ ] Frete é calculado corretamente: grátis dentro do raio, cobrado por km fora dele
- [ ] Pedido aparece em tempo real no painel do lojista com o status correto
- [ ] Lojista consegue imprimir a comanda do pedido com todos os dados exigidos
- [ ] Lojista consegue gerar relatório financeiro filtrado por período e forma de pagamento
- [ ] Cliente pode avaliar um produto após o pedido
- [ ] Lojista pode criar e aplicar cupons de desconto
- [ ] Botão de WhatsApp no pedido abre a conversa com o número do pedido pré-preenchido
- [ ] Admin pode cadastrar até 3 usuários e restringir o acesso de cada um por checkbox
- [ ] Lojista consegue cadastrar sua própria chave do Mercado Pago no painel e o checkout dessa loja passa a usar essa chave, sem alteração de variável de ambiente na Vercel

### Decisões resolvidas
- [x] Notificação push: Web Push API nativa (VAPID), via lib `web-push` — sem serviço terceiro, com log de toda tentativa de envio
- [x] Geocodificação/distância: OpenRouteService (rota real loja→cliente) — gratuito, sem cartão de crédito exigido, cota de 2000 requisições/dia no plano free
- [x] Roteamento multi-tenant: path por loja (`/loja/[slug]`) — subdomínio fica como evolução futura, quando houver domínio próprio
- [x] Criptografia das credenciais de integração por loja: Supabase Vault (pgsodium, nativo do Postgres)

### Decisões em aberto
- [ ] Fluxo de cobrança da mensalidade da assinatura
- [ ] Especificação completa do programa de fidelização (pós-MVP)
