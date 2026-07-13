# DESIGN.md — Sistema de design do app-delivery

## Racional
Pesquisa de tendências de UI para apps de delivery/mobile em 2026 aponta consistentemente para **neutros elevados** (cinza quente, areia, taupe, oatmeal) substituindo fundos branco-puro, com **paleta minimalista** (poucas cores, uma de destaque) e foco em clareza/acessibilidade em vez de apelo visual "chamativo". Fontes: [Best 8 Mobile App Color Scheme Trends for 2026](https://elements.envato.com/learn/color-scheme-trends-in-mobile-app-design), [UI Color Trends to Watch in 2026](https://updivision.com/blog/post/ui-color-trends-to-watch-in-2026), [Top 10 inspiring food delivery app UI/UX designs](https://uistudioz.com/blog/top-10-inspiring-food-delivery-app-ui-ux-designs/).

Isso combina com o posicionamento do app-delivery: é a "vitrine própria" da loja, não um marketplace saturado de cor/promoção como iFood — a interface deve parecer confiável e discreta, deixando a logo e as fotos dos produtos de cada loja serem o elemento visual de destaque, não a UI em si.

## Paleta
Base neutra quente (stone), 1 cor de destaque (terracota) usada **apenas** em ações primárias (botão de finalizar pedido, CTA principal), nunca em decoração. Suporte a light e dark mode via classe `.dark` (tokens em `app/globals.css`).

| Token | Uso |
|---|---|
| `background` / `surface` | Fundo da página / cards e painéis |
| `foreground` | Texto principal |
| `muted` / `muted-foreground` | Fundos secundários, texto de apoio |
| `border` | Bordas e divisórias |
| `accent` / `accent-foreground` | Ação primária (ex: "Finalizar pedido", "Adicionar ao carrinho") |
| `success` | Confirmação (pedido pago, entregue) |
| `danger` | Erro, cancelamento |

Nunca usar cor fora desses tokens diretamente em componentes — sempre via as classes Tailwind mapeadas (`bg-background`, `text-foreground`, `bg-accent`, etc.), definidas em `tailwind.config.js`.

## Tipografia e espaçamento
- Fonte: system font stack (sem custo de carregamento, boa legibilidade em qualquer dispositivo) — usar a fonte padrão do Next.js (`next/font`) com um sans-serif neutro (ex: Inter) se uma fonte customizada for necessária no futuro.
- Espaçamento generoso, cantos arredondados (`rounded` = 0.75rem por padrão) — linguagem visual "confortável", não densa.

## Diretrizes por área
- **Storefront (cliente)**: mobile-first, cards de produto com foto em destaque, poucas cores, CTA de compra sempre na cor `accent`.
- **Admin (lojista)**: precisa ser denso o suficiente para uso produtivo em desktop (tabelas de pedidos, filtros de relatório), mas mantém a mesma paleta neutra — sem gráficos ou badges em cores aleatórias fora dos tokens definidos.
- **Estados de pedido**: usar `success` para "pago"/"entregue", `danger` para "cancelado", `muted` para "pendente" — nunca inventar cores novas por tela.

## Dark mode
Ambos os temas (claro/escuro) devem funcionar desde o início — os tokens em `app/globals.css` já cobrem os dois. Nenhum componente deve usar cor fixa (`#fff`, `bg-white`) fora dos tokens, para não quebrar no dark mode.
