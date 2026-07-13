# UX Architecture — V-Check Login Redesign

**Date:** 2026-04-07
**Total Screens:** 1 tela principal + 4 estados
**User Roles:** Gestor Municipal, Diretor Escolar, Professor, Responsável

---

## 1. Arquitetura de Informação

```
V-Check Login
├── Área Esquerda — Painel Visual (desktop only)
│   ├── Ilustração/Visual de impacto (educação + tecnologia)
│   ├── Tagline do V-Check
│   └── Indicadores de confiança (selo GPTW, criptografia, dados)
│
├── Área Direita — Painel de Autenticação
│   ├── Logo V-Check + Subtítulo
│   ├── Título: "Painel de Acesso"
│   ├── Subtítulo contextual: "Insira suas credenciais da Secretaria de Educação"
│   ├── Formulário
│   │   ├── Campo: E-mail (com ícone Mail)
│   │   ├── Campo: Senha (com ícone Lock)
│   │   └── Link: "Esqueci a senha"
│   ├── Botão: "Autenticar" (com ícone ArrowRight)
│   ├── Mensagem de erro (condicional)
│   └── Rodapé: copyright + indicador de segurança
│
└── Mobile — Stack Vertical
    ├── Logo V-Check (compacta)
    ├── Visual reduzido (gradiente + ícone)
    ├── Card de Autenticação (full width)
    └── Rodapé compacto
```

## 2. Fluxos de Usuário

### Flow 1: Login Padrão (Happy Path)
**User:** Qualquer role
**Job:** Acessar o sistema no início do expediente

```
Abrir V-Check → Ver tela de login → Preencher e-mail → Preencher senha
→ Clicar "Autenticar" → [Loading 1-3s] → Redirect para dashboard
                                            ├── admin → /admin/tenants
                                            └── outros → /municipal
```

### Flow 2: Credenciais Inválidas
**User:** Qualquer role
**Job:** Corrigir erro de digitação

```
Preencher formulário → Clicar "Autenticar" → [Loading]
→ Erro retornado → Exibir banner de erro vermelho (fade-in)
→ Campos mantêm valores → Usuário corrige → Tenta novamente
```

### Flow 3: Sessão Existente (Auto-redirect)
**User:** Usuário que não fez logout
**Job:** Acessar diretamente sem re-login

```
Abrir /login → [Spinner centralizado] → Sessão detectada
→ Redirect automático para dashboard (sem ver formulário)
```

### Flow 4: Esqueci a Senha (futuro)
**User:** Qualquer role
**Job:** Recuperar acesso

```
Ver tela de login → Clicar "Esqueci a senha"
→ [Futuro: modal ou redirect para reset] — não implementado ainda
```

### Flow 5: Impersonação via Token (admin)
**User:** Admin/Suporte
**Job:** Acessar como outro tenant

```
Receber URL com hash token → Abrir URL → Token detectado automaticamente
→ Sessão criada → Redirect para tenant do token
```

## 3. Inventário de Telas

| # | Tela | Tipo | Role | Conteúdo Principal | Ações Principais | Prioridade |
|---|------|------|------|--------------------|------------------|------------|
| 1 | Login — Estado Padrão | authentication | Todos | Logo, formulário email/senha, tagline | Autenticar, Esqueci senha | Hero |
| 1a | Login — Carregando | state | Todos | Spinner no botão, formulário desabilitado | Aguardar | Alta |
| 1b | Login — Erro | state | Todos | Banner de erro, formulário preenchido | Corrigir e retentar | Alta |
| 1c | Login — Verificando Sessão | state | Todos | Spinner centralizado (fullscreen) | Nenhuma (auto-redirect) | Média |

## 4. Hierarquia Visual (Layout Pattern)

### Pattern: Split-Screen Login (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │                      │  │                              │ │
│  │   PAINEL VISUAL      │  │   PAINEL DE AUTENTICAÇÃO     │ │
│  │                      │  │                              │ │
│  │   • Visual de        │  │   [Logo V-Check]             │ │
│  │     impacto          │  │                              │ │
│  │   • Gradiente azul   │  │   Painel de Acesso           │ │
│  │     → verde (edu)    │  │   Credenciais da Secretaria  │ │
│  │   • Tagline          │  │                              │ │
│  │   • Elementos        │  │   [E-mail_______________]    │ │
│  │     decorativos      │  │   [Senha________________]    │ │
│  │     abstratos        │  │         Esqueci a senha →    │ │
│  │   • Selo de          │  │                              │ │
│  │     confiança        │  │   [=== Autenticar ====>]     │ │
│  │                      │  │                              │ │
│  │                      │  │   🔒 Conexão criptografada   │ │
│  │                      │  │   © 2026 Viggo               │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Pattern: Stacked Login (Mobile ≤768px)

```
┌──────────────────────┐
│                      │
│  ┌──────────────────┐│
│  │ Gradiente header ││
│  │ [Logo] V-Check   ││
│  │ Controle Escolar ││
│  └──────────────────┘│
│                      │
│  ┌──────────────────┐│
│  │ Painel de Acesso ││
│  │                  ││
│  │ [E-mail________] ││
│  │ [Senha_________] ││
│  │  Esqueci senha → ││
│  │                  ││
│  │ [= Autenticar =] ││
│  └──────────────────┘│
│                      │
│  🔒 © 2026 Viggo    │
│                      │
└──────────────────────┘
```

## 5. Decisões de UX

### Por que Split-Screen?
- **Impacto visual:** O painel esquerdo cria uma primeira impressão forte sem poluir o formulário
- **Contexto:** Comunica a identidade do produto (educação + tecnologia) antes do usuário interagir
- **Credibilidade:** Espaço para selos de confiança que reforçam a segurança (importante para dados de menores)
- **Precedente:** Padrão consolidado em SaaS modernos (Notion, Linear, Vercel) — familiar para o público-alvo

### Hierarquia de Atenção
1. **Logo V-Check** — identidade imediata
2. **Campos do formulário** — ação principal
3. **Botão "Autenticar"** — CTA único e claro
4. **Painel visual** — contexto e impacto (não compete com o formulário)
5. **Rodapé** — confiança e legalidade

### Acessibilidade
- Tab order: e-mail → senha → esqueci senha → autenticar
- Labels visíveis (não apenas placeholder)
- Contraste mínimo 4.5:1 em todos os textos
- Focus visible em todos os elementos interativos
- Erro anunciado via aria-live

## 6. Componentes Reutilizáveis Identificados

| Componente | Usado Em | Descrição |
|-----------|---------|-----------|
| LogoVCheck | Login, Header interno | Logo SVG do V-Check (já existe) |
| Button (shadcn) | Login, todo o app | Botão primário com variantes |
| Card (shadcn) | Login, dashboards | Container com borda e sombra |
| Input com ícone | Login, formulários | Campo de texto com ícone à esquerda |
| Banner de erro | Login, formulários | Mensagem de erro com ícone Info |
| Painel visual decorativo | **Novo** — apenas login | Background com gradiente e elementos abstratos |

## 7. Recomendações para Design System Engineer

- **Gradiente principal:** Azul Viggo → verde educação (remete a crescimento/aprendizado)
- **Elementos abstratos:** Formas geométricas sutis que remetam a livros, conectividade, ou grafos — sem ser literal
- **Tipografia no painel:** Uma frase de impacto ("Presença que transforma educação" ou similar)
- **Micro-interações:** Focus glow nos inputs, hover no botão, fade-in do erro
- **Dark mode:** O painel visual deve funcionar em ambos os temas
