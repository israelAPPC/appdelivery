# Avaliação do N8N para o app-delivery

## O que é o N8N, em linguagem simples

O N8N é uma ferramenta de **automação visual**: você monta fluxos ("workflows") arrastando e conectando caixinhas, cada uma representando uma ação — "quando isso acontecer, faça aquilo". Por exemplo: "quando um pedido for criado no Supabase → envie uma mensagem no WhatsApp para o cliente → depois de 1 hora, se o status ainda for 'pendente', avise o lojista".

É parecido com o Zapier ou Make (Integromat), mas com uma diferença importante: **o N8N pode ser instalado de graça no seu próprio servidor** (self-hosted), sem limite de execuções — você só paga se usar a versão em nuvem deles. Como o app-delivery já pretende operar no plano gratuito de Vercel/Supabase, essa característica combina bem com o espírito do projeto.

Ele não substitui o Next.js/Supabase — ele fica "por fora", observando eventos e disparando ações em serviços externos (WhatsApp, e-mail, planilhas, outros sistemas). É a camada de automação, não a aplicação em si.

## Como ele se encaixaria no app-delivery

O app-delivery já tem, no seu SPEC, pontos que hoje são manuais ou ficaram como decisão em aberto — o N8N é um bom candidato para resolver vários deles sem escrever código de integração dentro do Next.js:

1. **Disparo de mensagens via WhatsApp** — hoje o SPEC prevê um botão que abre o WhatsApp do cliente para o cliente mandar mensagem manualmente. O N8N pode ir além: quando o status do pedido mudar (ex: "saiu para entrega"), o N8N dispara automaticamente uma mensagem de WhatsApp para o cliente avisando — usando a API do WhatsApp Business (via provedor gratuito/baixo custo como a Evolution API, que é open-source, ou a API oficial da Meta que tem cota gratuita mensal).
2. **Notificação alternativa ao push** — você relatou problemas com o OneSignal no projeto anterior (App_salão). O N8N pode servir como um "roteador de notificação" mais confiável: ele escuta o evento no Supabase e tenta múltiplos canais (push, WhatsApp, e-mail) com fallback — se um falhar, tenta o outro, e registra o que aconteceu.
3. **Lembrete de carrinho abandonado** — se um cliente monta o carrinho e não finaliza em X minutos, o N8N pode disparar um lembrete automático.
4. **Cobrança da mensalidade das lojas** (uma das suas pendências futuras) — o N8N pode automatizar o lembrete de vencimento, envio de link de pagamento, e até suspensão automática de acesso de lojas inadimplentes, sem você precisar codificar isso dentro do próprio sistema.
5. **Relatório periódico automático** — enviar por e-mail ou WhatsApp, toda segunda-feira, um resumo das vendas da semana anterior para o lojista (usando os dados do módulo de Relatórios Financeiros).
6. **"Agente" de atendimento simples** — o N8N tem nós de integração com LLMs (incluindo Claude e Gemini). Dá para montar um fluxo onde uma dúvida recebida via WhatsApp é respondida automaticamente por um modelo de IA para perguntas simples (horário de funcionamento, status do pedido), escalando para um humano quando não souber responder.

## O que é gratuito e o que não é

| Componente | Gratuito? | Observação |
|---|---|---|
| N8N self-hosted (rodando em um servidor seu) | Sim, sem limite de execuções | Precisa de um lugar para rodar — ex: uma VM gratuita (Oracle Cloud Free Tier, Railway free tier limitado) ou um plano pago barato |
| N8N Cloud (hospedado por eles) | Tem plano gratuito bem limitado (poucas execuções/mês) | Mais fácil de configurar, mas você esbarra no limite rápido em produção |
| WhatsApp via API oficial (Meta) | Cota gratuita mensal de conversas iniciadas pela empresa | Depois da cota, cobra por conversa; exige cadastro de número comercial |
| WhatsApp via Evolution API (open-source, não-oficial) | Gratuito, mas roda sobre o WhatsApp Web — risco de bloqueio do número pela Meta se usado em volume alto | Mais simples de começar, mas menos "oficial"/estável que a API da Meta |
| Integração com Supabase/Postgres no N8N | Gratuita (nó nativo) | Sem custo adicional |

**Recomendação de custo zero para começar**: N8N self-hosted (ex: em uma VM gratuita ou junto com um plano free de alguma nuvem) + Evolution API para WhatsApp em fase de testes, migrando para a API oficial da Meta quando o volume de mensagens justificar.

## Vale a pena para este projeto?

Sim, mas como uma **camada complementar, não como parte do MVP do Sprint 1**. Faz sentido introduzir o N8N depois que o fluxo principal (catálogo → carrinho → checkout → pedido → painel) já estiver funcionando, porque:

- Ele resolve muito bem justamente os pontos que você já sinalizou como frágeis ou pendentes (notificação confiável, cobrança de assinatura, WhatsApp automático)
- Não exige que os agents de implementação (backend-notifications, etc.) resolvam tudo dentro do código do Next.js — parte da complexidade sai do app e vai para fluxos visuais, mais fáceis de você mesmo ajustar sem precisar programar
- É gratuito para o volume que uma lanchonete/bar individual vai gerar no início

## Recomendação de próximo passo

Não implementar agora. Sugiro revisitar isso no **pós-MVP (Sprint 2 em diante)**, especificamente para resolver:
1. Notificação de status de pedido (como alternativa/complemento ao módulo `backend-notifications`)
2. Cobrança da mensalidade da loja (pendência já registrada no SPEC.md)

Quando chegar nessa fase, o próprio agent `orquestrador` pode ser acionado para desenhar os workflows específicos do N8N como parte do plano dessas features.
