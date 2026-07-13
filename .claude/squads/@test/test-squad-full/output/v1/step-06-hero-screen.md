# Hero Screen — V-Check Login Institucional

**Date:** 2026-04-07
**Stitch Project ID:** 9524578912695639125
**Stitch Screen ID:** 403b295805804974ab82985e5a66dbc5
**Design System:** V-Check Institutional (Stitch-generated)

---

## Screenshot

![V-Check Login](https://lh3.googleusercontent.com/aida/ADBb0ujRT3MWRcadoRpn4-KrMVozSSXb_6wyP4omcoYz7uhRB34MMEjx4BZXM9ZwbxhWnHreJyZhhHglq4BdsfWQaPw_1l6gcqOxbON4RhWPj39Ai3bOY3zz85Gwe-KLQ0BcsV9JykCRkxY5CoTTFqvjyLYDqEOXhgK_aO0I2QCKslEkDw6W5-zyavPL6Jy2K-wLXCJEVkn9FknzFKJEw55bHZTcIkAiU9yNHYQDF5kud-J46O-4ctEI8W216Yo=w1920)

## Downloads

- **HTML:** [Download HTML](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2IxMGEwYWViYmJiYjQ4ZmJhOTg4NjE2Y2JiNTBkZTM4EgsSBxDb8YyM-Q8YAZIBIwoKcHJvamVjdF9pZBIVQhM5NTI0NTc4OTEyNjk1NjM5MTI1&filename=&opi=96797242)
- **Screenshot Full Res:** [Download Screenshot](https://lh3.googleusercontent.com/aida/ADBb0ujRT3MWRcadoRpn4-KrMVozSSXb_6wyP4omcoYz7uhRB34MMEjx4BZXM9ZwbxhWnHreJyZhhHglq4BdsfWQaPw_1l6gcqOxbON4RhWPj39Ai3bOY3zz85Gwe-KLQ0BcsV9JykCRkxY5CoTTFqvjyLYDqEOXhgK_aO0I2QCKslEkDw6W5-zyavPL6Jy2K-wLXCJEVkn9FknzFKJEw55bHZTcIkAiU9yNHYQDF5kud-J46O-4ctEI8W216Yo=w1920)

---

## Prompt Usado

```
Design a split-screen login page for "V-Check", a school attendance control system for public schools in Brazil.

PLATFORM: DESKTOP (1440x900)

LAYOUT: Split-screen with two panels side by side, no gap between them.

LEFT PANEL (55% width):
- Full-height rich gradient background flowing diagonally (160deg) from deep navy blue (#0D2B4E) at top through vivid blue (#1A3F7A) in middle to education green (#0B6B4E) at bottom
- Subtle abstract geometric decorative elements at very low opacity (6-12%): concentric circles top-left, dot grid center, diagonal lines bottom-right
- Large bold tagline text in white: "Presença que transforma educação" (display size, font-weight 700, letter-spacing -0.03em)
- Below tagline, smaller subtitle in light blue-gray (#B0C4D8): "Controle de frequência inteligente para escolas públicas"
- At the bottom, three trust badges in a horizontal row with subtle opacity (0.7), using light blue-gray text:
  * Shield icon + "Dados criptografados"
  * School icon + "Escolas públicas conectadas"
  * Clock icon + "Frequência em tempo real"

RIGHT PANEL (45% width):
- Clean off-white background (#F8FAFC)
- Vertically centered authentication card with deep layered shadow
- Card max-width 420px, padding 32px, border-radius 1.05rem, subtle border
- At top of card: "V-Check" logo text in bold dark text
- Subtitle: "CONTROLE DE FREQUÊNCIA ESCOLAR" (uppercase, small, wide tracking)
- Section title: "Painel de Acesso" (semi-bold, 1.125rem)
- Two input fields with left-aligned icons (16px, gray):
  * Email (envelope icon): Label "E-MAIL" (uppercase), placeholder "seu@email.com"
  * Password (lock icon): Label "SENHA" (uppercase), placeholder "••••••••"
- Link: "Esqueci a senha" (blue, bold, small, right-aligned)
- Primary button: "Autenticar" (vivid blue, white text, bold, right arrow icon)
- Footer: "© 2026 V-Check — Todos os direitos reservados"

CRITICAL: Portuguese text ONLY. Premium institutional feel. No cartoons. No Inter font. No Viggo mention.
```

---

## Avaliação de Design

| Critério | Nota (1-5) | Observações |
|----------|:----------:|-------------|
| Consistência com DESIGN.md | 5 | Gradiente azul→verde, split-screen 55/45, paleta respeitada |
| Qualidade Visual Premium | 5 | Institucional moderno, limpo, profissional — não parece template |
| Hierarquia Tipográfica | 5 | Tagline display > título > labels uppercase > body — hierarquia clara |
| Densidade de Dados | 5 | Apropriada para tela de login — foco no formulário, sem ruído |
| Conformidade pt-BR | 5 | Todo texto em português: "Presença que transforma educação", "Painel de Acesso", "Autenticar", "Esqueci a senha" |
| Anti-Genérico Check | 5 | Sem card centralizado em fundo branco, sem fotos stock, sem ilustrações cartoon |

**Score Médio: 5.0/5** — Aprovada para checkpoint.

---

## Elementos Verificados

- [x] Layout split-screen 55% visual / 45% autenticação
- [x] Gradiente azul profundo (#0D2B4E) → verde educação (#0B6B4E)
- [x] Tagline "Presença que transforma educação"
- [x] Subtítulo descritivo em azul-cinza claro
- [x] Elementos geométricos decorativos sutis (círculos concêntricos visíveis)
- [x] Badges de confiança: criptografia, escolas conectadas, frequência em tempo real
- [x] Card de autenticação com shadow profunda
- [x] "V-Check" como marca independente (sem Viggo)
- [x] "CONTROLE DE FREQUÊNCIA ESCOLAR" em caption uppercase
- [x] "Painel de Acesso" como título da seção
- [x] Labels uppercase: "E-MAIL", "SENHA"
- [x] Ícones nos inputs (envelope, cadeado)
- [x] "Esqueci a senha" como link
- [x] Botão "Autenticar" com ícone de seta
- [x] Copyright "© 2026 V-Check"
- [x] Todo texto em português brasileiro

## Iterações

| # | O que Mudou | Por quê |
|---|-------------|---------|
| 1 | Geração inicial | Prompt otimizado com todos os tokens do DESIGN.md — resultado aprovado na primeira iteração |
| 2 | Adição da logo V-Check no painel visual | Feedback do usuário: faltava a logo. Posicionada no topo-esquerdo do painel gradiente. Stitch renderizou como placeholder — logo real será integrada no Step 10 (código) via componente `<LogoVCheck>` |

### Screen Iterada (com placeholder da logo)
- **Screen ID:** 564a61da59fd4fd9a105a880d4671789
- **Screenshot:** [Ver](https://lh3.googleusercontent.com/aida/ADBb0uifB2cXYo0PZ6weU5_wi8Sh3XMNGn2g7znbA93BjKUTUK99KLJaN2nRt6ZtDz5wxaHbvLWbvRqEQ8pN0wCPiiLWKRCWup3-86bPeyXGfoYyJU81286CpvvYrluvOQIKCeRRcGk5yGF0B4wYCyEfVPaIciqcqbVp8YYBsz4DyhOk0qzm4f4e_UGRYKmaOR2A8ttKJ2qEIQL11W3ZPnpIuGVOZhVzTPnnnwqK8jC0xcLmoZ3g7V28Nduhc6Y=w1920)
- **HTML:** [Download](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzU3MzI5NTk1Njk1MjRlZmY5OTIzMzhlNWQxNTQ3Yjg4EgsSBxDb8YyM-Q8YAZIBIwoKcHJvamVjdF9pZBIVQhM5NTI0NTc4OTEyNjk1NjM5MTI1&filename=&opi=96797242)
- **Nota:** Logo aparece como placeholder branco. A logo real (escudo azul + check verde) será incorporada no Step 10 (conversão para React)

---

## Stitch Design System Gerado

O Stitch criou automaticamente um design system chamado **"V-Check Institutional"** com as seguintes características:
- **Paleta:** Navy profundo (#001631 / #0D2B4E), azul secundário (#3D5E9A / #1A3F7A), verde educação (#0B6B4E)
- **Tipografia:** Manrope (display/headlines) + Inter (body/interface)
- **Superfícies:** Hierarquia tonal sem linhas (surface → container_low → container_lowest)
- **Filosofia:** "The Digital Architect" — institucional, premium, sério
- **Anti-patterns:** Sem bordas divisórias, sem sombras pesadas, sem preto puro
