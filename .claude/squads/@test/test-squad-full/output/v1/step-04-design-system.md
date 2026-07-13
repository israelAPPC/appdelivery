# DESIGN.md — V-Check Login Redesign

**Date:** 2026-04-07
**Visual Tier:** Premium
**Target Platform:** Responsive (Desktop-first)

---

## Personalidade Visual

**Emoção:** Confiança institucional + modernidade tecnológica. O usuário deve sentir: "Este é um sistema sério, feito por gente que entende de tecnologia e educação."
**Metáfora:** Portal de acesso governamental moderno — como entrar em um prédio institucional que foi reformado com arquitetura contemporânea. Não é frio e burocrático, mas também não é playful.
**One-liner:** "Tecnologia séria a serviço da educação pública — sem parecer que foi feito nos anos 2000."

### Anti-Patterns (PROIBIDO)

- ❌ Inter font como tipografia principal (projeto já usa Geist — manter)
- ❌ Background branco puro sem nenhum elemento visual (genérico)
- ❌ Neon, glows excessivos, ou gradientes saturados demais
- ❌ Ilustrações cartoon de crianças, livros, ou lápis (infantil)
- ❌ Foto genérica de escola/sala de aula no background (clichê stock)
- ❌ Card centralizado sozinho em tela branca (template de IA)
- ❌ Sombras default sem camadas intencionais
- ❌ Rounded-everything — botões arredondados, inputs arredondados, tudo igual
- ❌ Grid simétrico sem hierarquia visual
- ❌ Textos em inglês ("Sign In", "Welcome back", "Enter your credentials")

---

## Paleta de Cores — Login Específica

### Painel Visual (lado esquerdo)

O painel visual usa um gradiente rico que vai do **Azul Viggo profundo** para um **verde educacional**, com uma camada de textura sutil.

| Token | Valor OKLCH | Hex Aprox. | Uso |
|-------|-------------|-----------|-----|
| `--login-gradient-start` | oklch(0.25 0.08 260) | #0D2B4E | Topo do gradiente — azul profundo |
| `--login-gradient-mid` | oklch(0.35 0.15 255) | #1A3F7A | Meio do gradiente — azul vivo |
| `--login-gradient-end` | oklch(0.45 0.13 160) | #0B6B4E | Base do gradiente — verde educação |
| `--login-accent-glow` | oklch(0.65 0.18 180) | #00B89C | Glow sutil em elementos decorativos |
| `--login-text-hero` | oklch(0.97 0.003 247) | #F5F7FA | Texto sobre gradiente |
| `--login-text-sub` | oklch(0.82 0.015 220) | #B0C4D8 | Texto secundário sobre gradiente |

### Painel de Autenticação (lado direito)

Usa os tokens existentes do projeto (globals.css) sem alteração:

| Token | Valor OKLCH | Uso |
|-------|-------------|-----|
| `--background` | oklch(0.985 0.002 247) | Background do painel |
| `--foreground` | oklch(0.164 0.018 262) | Texto principal |
| `--primary` | oklch(0.588 0.213 264) | Botão, links, accents |
| `--primary-foreground` | oklch(0.98 0.003 247) | Texto sobre primary |
| `--muted` | oklch(0.965 0.005 247) | Background dos inputs |
| `--muted-foreground` | oklch(0.553 0.026 253) | Labels, placeholders |
| `--border` | oklch(0.929 0.01 252) | Bordas dos inputs/cards |
| `--destructive` | oklch(0.635 0.225 25) | Mensagem de erro |
| `--ring` | oklch(0.588 0.213 264) | Focus ring |

### Dark Mode

O painel visual mantém o gradiente (funciona em ambos os temas). O painel de autenticação segue os tokens `.dark` já definidos no projeto.

---

## Tipografia

**Font primária:** Geist Sans (já instalada via `next/font`)
**Font mono:** Geist Mono (já instalada)

| Token | Tamanho | Peso | Line Height | Letter Spacing | Uso na Login |
|-------|---------|------|-------------|----------------|-------------|
| `display` | clamp(1.75rem, 3vw, 2.5rem) | 700 | 1.15 | -0.03em | Tagline no painel visual |
| `h2` | 1.125rem | 600 | 1.3 | -0.01em | "Painel de Acesso" |
| `body` | 0.875rem | 400 | 1.5 | 0 | Texto descritivo |
| `label` | 0.6875rem | 600 | 1.4 | 0.08em | Labels (uppercase) "E-MAIL", "SENHA" |
| `small` | 0.6875rem | 500 | 1.4 | 0.02em | "Esqueci a senha", rodapé |
| `caption` | 0.625rem | 700 | 1.3 | 0.15em | "CONTROLE DE FREQUÊNCIA ESCOLAR", copyright |
| `error` | 0.75rem | 500 | 1.4 | 0 | Mensagem de erro |

---

## Elementos Visuais do Painel

### Gradiente Background

```css
background: linear-gradient(
  160deg,
  oklch(0.25 0.08 260) 0%,      /* Azul profundo */
  oklch(0.35 0.15 255) 40%,     /* Azul vivo */
  oklch(0.40 0.14 220) 70%,     /* Transição */
  oklch(0.45 0.13 160) 100%     /* Verde educação */
);
```

### Elementos Decorativos

Formas geométricas abstratas em SVG inline, com `opacity: 0.06-0.12`:

1. **Círculos concêntricos** (canto superior esquerdo) — remetem a ondas/conexão
2. **Grid de pontos** (centro) — remetem a dados/frequência
3. **Linhas diagonais** (canto inferior direito) — remetem a crescimento/progresso

Estes elementos são puramente decorativos e NÃO devem competir com o texto.

### Tagline

Texto grande no painel visual:

> **"Presença que transforma educação"**

Abaixo, em texto menor:
> "Controle de frequência inteligente para escolas públicas"

### Indicadores de Confiança (bottom do painel)

- Ícone Shield + "Dados criptografados"
- Ícone School + "Escolas públicas conectadas"
- Ícone Clock + "Frequência em tempo real"

**IMPORTANTE:** O V-Check é um produto independente destinado a órgãos públicos. NÃO vincular à marca Viggo. Nenhuma referência a "Viggo", "Viggo Sistemas", ou certificações da empresa-mãe.

Estilizados como badges sutis com `opacity: 0.7`, cor `--login-text-sub`.

---

## Componentes — Especificações Login

### Input Fields

```
Background:        var(--muted)
Border:            1px solid var(--border)
Border (focus):    1px solid var(--primary)
Ring (focus):      0 0 0 3px oklch(0.588 0.213 264 / 0.1)
Border radius:     var(--radius-md) → 0.6rem
Padding:           10px 16px 10px 40px (com ícone)
Font:              Geist Sans, 0.875rem, weight 500
Placeholder:       var(--muted-foreground), weight 400
Icon:              16px, var(--muted-foreground), stroke-width 2.2
Height:            44px
Transition:        border-color 150ms, box-shadow 150ms
```

### Botão Autenticar

```
Background:        var(--primary)
Background hover:  oklch(0.54 0.22 264)  /* ligeiramente mais escuro */
Text:              var(--primary-foreground), 0.875rem, weight 700
Height:            44px
Border radius:     var(--radius-md) → 0.6rem
Shadow:            0 1px 3px oklch(0.588 0.213 264 / 0.25)
Shadow hover:      0 4px 12px oklch(0.588 0.213 264 / 0.35)
Transition:        all 200ms ease
Active:            transform scale(0.98)
Icon:              ArrowRight, 16px, stroke-width 2.5
Loading:           Loader2 spin, 18px
```

### Card de Autenticação

```
Background:        var(--card) → branco
Border:            1px solid var(--border)
Border radius:     var(--radius-xl) → 1.05rem
Shadow:            0 1px 3px oklch(0 0 0 / 0.04), 0 8px 24px oklch(0 0 0 / 0.06)
Padding interno:   32px
Max width:         420px
```

Não usar o componente `<Card>` padrão — o shadow precisa de mais profundidade que o default.

### Banner de Erro

```
Background:        oklch(0.635 0.225 25 / 0.05)
Border:            1px solid oklch(0.635 0.225 25 / 0.2)
Border radius:     var(--radius-md)
Padding:           12px
Icon:              Info, 16px, var(--destructive)
Text:              0.75rem, weight 500, var(--destructive)
Animation:         fade-in + slide-in-from-top-1, 300ms
```

### Link "Esqueci a senha"

```
Color:             var(--primary)
Font:              0.6875rem, weight 700
Hover:             underline
Transition:        color 150ms
```

---

## Layout — Especificações

### Desktop (≥1024px)

```
Layout:            CSS Grid — 2 colunas
Coluna esquerda:   55% — Painel Visual (gradiente + decorações + tagline)
Coluna direita:    45% — Painel de Autenticação (centralizado vertical)
Min-height:        100vh
Gap:               0 (os painéis encostam)
```

### Tablet (768px–1023px)

```
Layout:            Coluna única
Painel visual:     Header compacto com gradiente (200px de altura)
                   Logo + tagline em versão condensada
Painel auth:       Abaixo do header, centralizado
```

### Mobile (≤767px)

```
Layout:            Coluna única
Painel visual:     Strip compacto (120px) com gradiente + logo
                   Sem elementos decorativos, sem tagline longo
Painel auth:       Full width com padding 24px lateral
Card:              Sem shadow/border em mobile (flat, integrado)
```

### Breakpoints

| Token | Valor | Uso |
|-------|-------|-----|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop — ativa split-screen |
| `xl` | 1280px | Desktop grande |
| `2xl` | 1536px | Ultra-wide |

---

## Micro-Interações

| Elemento | Trigger | Animação |
|----------|---------|----------|
| Página inteira | Mount | `animate-in fade-in duration-700` |
| Input | Focus | Border color transition 150ms + ring glow |
| Botão Autenticar | Hover | Shadow expand + color darken |
| Botão Autenticar | Active/Click | `scale(0.98)` 100ms |
| Botão Autenticar | Loading | Ícone → Loader2 spin |
| Banner de erro | Mount | `fade-in slide-in-from-top-1 duration-300` |
| Elementos decorativos | Mount | `fade-in duration-1000 delay-300` (mais lento que o conteúdo) |

---

## Acessibilidade

- Labels visíveis em todos os campos (não apenas placeholder)
- Contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande
- Focus visible em todos os elementos interativos (ring de 3px)
- Tab order: e-mail → senha → esqueci senha → autenticar
- `aria-live="polite"` no container de erro
- `aria-label` no botão durante loading ("Autenticando...")
- Input type correto: `email` e `password`
- `autocomplete="email"` e `autocomplete="current-password"`

---

## Prompt Guidelines para Stitch

Ao gerar a tela no Stitch, usar este contexto:

1. **Layout:** Split-screen login, 55/45, desktop
2. **Esquerda:** Gradiente azul→verde com elementos geométricos abstratos sutis, tagline "Presença que transforma educação", badges de confiança na base
3. **Direita:** Fundo off-white, card de login com shadow profunda, logo V-Check topo, form com e-mail/senha, botão azul "Autenticar"
4. **Tipografia:** Geist Sans, hierarquia clara, labels uppercase
5. **Cores:** Azul Viggo oklch(0.588 0.213 264) como primary, gradiente de oklch(0.25 0.08 260) a oklch(0.45 0.13 160)
6. **Mood:** Institucional moderno, tech educacional, premium sem ser corporativo frio
7. **NÃO INCLUIR:** Ilustrações literais, fotos stock, neon, fontes decorativas, texto em inglês
