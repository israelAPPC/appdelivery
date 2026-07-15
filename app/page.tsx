import Link from "next/link";

/**
 * app/page.tsx
 *
 * Landing page publica (Task 6.1). Publico-alvo: o LOJISTA (dono de
 * lanchonete/bar/restaurante), nao o consumidor final — apresenta o
 * produto e leva ao cadastro da loja (`/cadastro`) ou ao login
 * (`/login`) de quem ja tem conta. Conteudo baseado em SPEC.md.
 *
 * Nao ha secao de precos: o modelo de cobranca da mensalidade e uma
 * decisao em aberto (ver CLAUDE.md) e nao deve ser resolvida aqui.
 */

const FEATURES = [
  {
    title: "Catálogo de produtos",
    description: "Cadastre produtos, categorias, fotos e disponibilidade — tudo pelo painel da sua loja.",
  },
  {
    title: "Carrinho e checkout",
    description: "Cliente monta o pedido e escolhe pagar agora pelo Mercado Pago ou pagar na entrega/retirada.",
  },
  {
    title: "Frete configurável",
    description: "Defina um raio grátis ao redor da sua loja e um preço por km para entregas mais distantes.",
  },
  {
    title: "Painel de pedidos em tempo real",
    description: "Pedidos novos aparecem na hora, sem depender de recarregar a tela ou ficar de olho no WhatsApp.",
  },
  {
    title: "PWA com a sua logo",
    description: "Seu cliente instala um app com o ícone e o nome da sua loja, direto do navegador.",
  },
  {
    title: "Relatórios financeiros",
    description: "Acompanhe o total vendido por dia, semana, mês ou ano, segmentado por forma de pagamento.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Cadastre a sua loja",
    description: "Crie sua conta em poucos minutos, sem necessidade de suporte técnico.",
  },
  {
    number: "2",
    title: "Configure frete e produtos",
    description: "Defina o raio de entrega grátis, o preço por km e monte seu catálogo.",
  },
  {
    number: "3",
    title: "Cliente instala o PWA da loja",
    description: "Seus clientes acessam o link da sua loja e instalam o app com a sua marca.",
  },
  {
    number: "4",
    title: "Pedidos chegam no painel",
    description: "Cada pedido aparece em tempo real no seu painel, pronto para preparo e entrega.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <span className="text-lg font-semibold text-foreground">DeliveryPróprio</span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-foreground hover:opacity-80">
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Criar minha loja
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Sua loja, seu app de delivery — sem taxa por venda
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Plataformas de delivery tradicionais cobram uma taxa sobre cada venda, encarecendo seu produto. Com o
          DeliveryPróprio, você paga uma mensalidade fixa e tem seu próprio app de pedidos — chega de perder pedido
          no WhatsApp.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/cadastro"
            className="rounded-lg bg-accent px-6 py-3 text-base font-medium text-accent-foreground hover:opacity-90"
          >
            Criar minha loja grátis
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-semibold text-foreground">Tudo que sua loja precisa</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-surface p-6">
              <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-semibold text-foreground">Como funciona</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {step.number}
                </span>
                <h3 className="mt-3 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Comece a receber pedidos direto no seu painel
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Mensalidade fixa, sem taxa por venda. Cadastre sua loja e configure tudo em poucos minutos.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/cadastro"
            className="rounded-lg bg-accent px-6 py-3 text-base font-medium text-accent-foreground hover:opacity-90"
          >
            Criar minha loja grátis
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          © {new Date().getFullYear()} DeliveryPróprio. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}
