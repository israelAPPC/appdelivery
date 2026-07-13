---
paths: "app/(admin)/**/*, app/(storefront)/**/*"
---

# Frontend

- Seguir `DESIGN.md` (raiz do projeto) para paleta, tokens de cor e diretrizes visuais — nunca usar cor fixa (`#fff`, `bg-white`, hex direto) fora dos tokens Tailwind mapeados (`bg-background`, `text-foreground`, `bg-accent`, etc.), para não quebrar o dark mode.
- Painel admin (`app/(admin)/`): obrigatoriamente responsivo, testado tanto em viewport desktop quanto mobile.
- Storefront (`app/(storefront)/`): mobile-first, é o principal caso de uso do cliente final.
- Nunca implementar cálculo de frete direto no componente — usar `app/lib/calculate-shipping.ts` (ver skill `calculo-frete`).
- Manifest.json dinâmico por loja sempre com fallback de ícone quando a loja não tem logo cadastrada.
- Botão de contato usa deep link `wa.me`, nunca implementar chat interno.
- Comanda impressa usa CSS `@media print`; omitir endereço de entrega em pedidos de retirada.
