# Frontend Components — V-Check Login Redesign

**Date:** 2026-04-07
**Framework:** Next.js 16.1.6 + React 19 + TypeScript 5
**Component Library:** shadcn/ui (base-nova style)
**Total Components:** 1 (login page — redesign completo)
**Total Pages:** 1

---

## Arquivos Modificados

### 1. `src/app/globals.css` — Tokens de Login Adicionados

Novos CSS custom properties para o painel visual da login:

```css
/* Login — Painel Visual */
--login-gradient-start: oklch(0.25 0.08 260);   /* Azul profundo */
--login-gradient-mid: oklch(0.35 0.15 255);     /* Azul vivo */
--login-gradient-end: oklch(0.45 0.13 160);     /* Verde educação */
--login-accent-glow: oklch(0.65 0.18 180);      /* Glow sutil */
--login-text-hero: oklch(0.97 0.003 247);       /* Texto sobre gradiente */
--login-text-sub: oklch(0.82 0.015 220);        /* Texto secundário sobre gradiente */
```

### 2. `src/app/login/page.tsx` — Redesign Completo

**Antes:** Card centralizado em fundo branco (layout simples)
**Depois:** Split-screen 55/45 com painel visual + card de autenticação

#### Layout Desktop (≥1024px)
- CSS Grid: `grid-cols-[55fr_45fr]`
- **Painel esquerdo:** Gradiente azul→verde (160deg), elementos geométricos decorativos (SVG inline), logo V-Check (80px), tagline, badges de confiança
- **Painel direito:** Background off-white, card com shadow profunda, formulário de autenticação

#### Layout Mobile (< 1024px)
- Coluna única
- Strip compacto (120px) com gradiente + logo no topo
- Card full-width abaixo

#### Componentes Reutilizados
| Componente | Fonte | Uso |
|------------|-------|-----|
| `Button` | shadcn/ui | Botão "Autenticar" |
| `LogoVCheck` | `@/apresentacao/componentes/logo_vcheck` | Logo no painel visual e mobile header |
| Lucide Icons | `lucide-react` | Mail, Lock, ArrowRight, Loader2, Info, Shield, School, Clock |

#### Lógica Preservada (sem alterações)
- Hook `usarAutenticacao()` — login, verificação de sessão
- Hook `usarTenant()` — roteamento baseado em slug
- Redirecionamento automático se já autenticado
- Loading state durante verificação de sessão
- Tratamento de erro com banner animado
- Loading spinner no botão durante autenticação

---

## Especificações de Design Implementadas

### Tokens CSS Mapeados

| Token DESIGN.md | Implementação | Onde |
|-----------------|---------------|------|
| `--login-gradient-start` | oklch(0.25 0.08 260) | globals.css :root |
| `--login-gradient-mid` | oklch(0.35 0.15 255) | globals.css :root |
| `--login-gradient-end` | oklch(0.45 0.13 160) | globals.css :root |
| `--login-text-hero` | oklch(0.97 0.003 247) | globals.css :root |
| `--login-text-sub` | oklch(0.82 0.015 220) | globals.css :root |
| Input height: 44px | `h-11` | Tailwind class |
| Input border-radius: 0.6rem | `rounded-[0.6rem]` | Tailwind class |
| Card border-radius: 1.05rem | `rounded-[1.05rem]` | Tailwind class |
| Card shadow | `shadow-[0_1px_3px_oklch(0_0_0/0.04),0_8px_24px_oklch(0_0_0/0.06)]` | Tailwind |
| Button shadow | `shadow-[0_1px_3px_oklch(0.588_0.213_264/0.25)]` | Tailwind |
| Button hover shadow | `hover:shadow-[0_4px_12px_oklch(0.588_0.213_264/0.35)]` | Tailwind |
| Focus ring | `focus:ring-[3px] focus:ring-ring/10` | Tailwind |
| Active scale | `active:scale-[0.98]` | Tailwind |
| Tagline size | `clamp(1.75rem, 3vw, 2.5rem)` | Inline style |
| Tagline weight | `font-bold` (700) | Tailwind |
| Tagline tracking | `-0.03em` | Inline style |
| Labels | `text-[0.6875rem] font-semibold uppercase tracking-[0.08em]` | Tailwind |
| Caption | `text-[0.625rem] font-bold uppercase tracking-[0.15em]` | Tailwind |

### Elementos Visuais (SVG inline)

1. **Círculos concêntricos** — topo-esquerdo, opacity 8%, 3 círculos
2. **Grid de pontos** — centro, opacity 6%, 12x12 grid
3. **Linhas diagonais** — inferior-direito, opacity 7%, 8 linhas

Animação: `fade-in duration-1000` com delays escalonados (300ms, 500ms, 700ms).

### Responsividade

| Breakpoint | Layout | Painel Visual | Card |
|------------|--------|---------------|------|
| < 1024px | Coluna única | Strip 120px com gradiente + logo | Full width |
| ≥ 1024px | Grid 55/45 | Full height com tagline + badges | Max 420px, centralizado |

### Acessibilidade

- [x] `aria-label` no botão durante loading ("Autenticando...")
- [x] `role="alert"` e `aria-live="polite"` no banner de erro
- [x] Labels visíveis em todos os campos
- [x] Input types corretos: `email` e `password`
- [x] `autoComplete="email"` e `autoComplete="current-password"`
- [x] Focus visible com ring de 3px

---

## Notas de Implementação

1. **Sem Card component do shadcn/ui** — O card usa shadow customizada (mais profunda que o default), implementado com div + classes Tailwind
2. **SVG inline** — Elementos decorativos são SVG inline, não arquivos externos, para evitar flash e garantir carregamento instantâneo
3. **Tokens em CSS vars** — Todos os tokens do login usam CSS custom properties para fácil manutenção e suporte a dark mode futuro
4. **Logo V-Check** — Usa o componente `<LogoVCheck>` existente que referencia `/icons/icon.svg`
5. **Copyright atualizado** — Removida referência "Viggo", agora é "© 2026 V-Check"
