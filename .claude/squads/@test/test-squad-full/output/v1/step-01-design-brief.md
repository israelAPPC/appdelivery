# Design Brief — V-Check Login Redesign

**Date:** 2026-04-07
**Project:** V-Check — Redesign da página de login do sistema de controle de frequência escolar
**Type:** Web app (Single Page — Login)
**Complexity:** Simple — 1 tela (login) com variações de estado
**Platform:** Responsive (Desktop-first, mobile-friendly)
**Visual Tier:** Premium (distintivo, impactante, moderno)

---

## Contexto do Produto

O **V-Check** é um sistema de controle de frequência e acesso escolar para escolas públicas, desenvolvido pela Viggo Sistemas. Atende secretarias municipais de educação, gestores escolares, professores e responsáveis de alunos. O sistema monitora presença, gerencia acessos e fornece dados de frequência escolar em tempo real.

A página de login é a **porta de entrada** do sistema — usada diariamente por funcionários de secretarias de educação, diretores e coordenadores escolares. Precisa transmitir **confiança institucional, tecnologia moderna e acessibilidade**, sem parecer genérica ou "template de IA".

O projeto atual usa **Next.js 16 + Tailwind CSS 4 + shadcn/ui** com design tokens em OKLCH. A tela de login atual é funcional e limpa, mas falta impacto visual e identidade forte.

## Usuários Primários

| Persona | Contexto de Uso | Dispositivo | Frequência |
|---------|----------------|-------------|------------|
| Gestor da Secretaria Municipal de Educação | Escritório, manhã, acesso diário | Desktop (1920px+) | Diário |
| Diretor/Coordenador Escolar | Escola, ao longo do dia | Desktop/Tablet | Diário |
| Professor | Sala de aula, início da aula | Tablet/Mobile | Diário |
| Responsável/Pai de Aluno | Casa, qualquer horário | Mobile (375px) | Esporádico |

## Inventário de Telas

| # | Screen Name | Priority | Type | Notes |
|---|-------------|----------|------|-------|
| 1 | Login | Hero | authentication | Tela principal — formulário de email/senha com branding V-Check |
| 1a | Login — Loading State | High | state | Estado de carregamento durante autenticação |
| 1b | Login — Error State | High | state | Exibição de erro de credenciais inválidas |
| 1c | Login — Session Check | Medium | state | Spinner enquanto verifica sessão existente |

## Seleção da Tela-Hero

**Selecionada:** Login (é a única tela e a mais representativa)
**Racional:** É literalmente a primeira impressão do sistema. Precisa comunicar: tecnologia moderna, segurança, propósito educacional e identidade Viggo — tudo em uma única tela.

## Restrições de Design

- **Todo texto em pt-BR** com acentos corretos — sem inglês na UI
- **Usar componentes shadcn/ui** existentes no projeto (Button, Card, Input)
- **Manter Tailwind CSS 4** com design tokens OKLCH já definidos
- **Preservar a lógica funcional** — hooks, autenticação, redirecionamento
- **Responsivo** — funcionar de 375px (mobile) a 1920px+ (desktop)
- **Acessível** — labels corretas, contraste adequado, navegação por teclado
- **Performance** — não adicionar imagens pesadas ou bibliotecas extras desnecessárias
- **Cor primária do sistema:** oklch(0.588 0.213 264) — Azul Viggo
- **Ícones:** Lucide React (já instalado)
- **Logo:** Componente `<LogoVCheck>` existente

## Referências Visuais e Direção

**O que queremos:**
- Impacto visual na primeira visualização — "wow, isso é uma escola pública?"
- Identidade forte — não parecer um login genérico de SaaS
- Elementos que remetam ao universo educacional sem ser infantil
- Gradientes sutis, profundidade, micro-interações
- Sensação de sistema governamental moderno (não burocrático)

**Anti-referências (o que NÃO queremos):**
- Login branco com card centralizado e nada mais (genérico)
- Ilustrações cartoon de crianças na escola (infantil demais)
- Neon/cyberpunk/dark mode forçado (fora do contexto)
- Inter font com grid simétrico sem personalidade (AI aesthetic)
- Background com foto genérica de escola (clichê)

## Stack Técnica do Projeto

- **Framework:** Next.js 16.1.6 (App Router)
- **React:** 19.2.3
- **Styling:** Tailwind CSS 4 + OKLCH tokens
- **Components:** shadcn/ui (base-nova style)
- **Icons:** Lucide React
- **Animations:** tw-animate-css
- **Theme:** next-themes (dark/light)
- **Auth:** Context-based com hooks personalizados em pt-BR

## Próximos Passos

1. → UX Architect: definir arquitetura de informação e hierarquia visual da tela de login
2. → Design System Engineer: definir paleta expandida, tipografia e tokens específicos para a tela hero
3. → Screen Generator: gerar a tela via Stitch com direção visual premium
4. → Frontend Converter: converter para React/Next.js + shadcn/ui
