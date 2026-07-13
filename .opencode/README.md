# OpenCode neste projeto

Espelho do setup do Claude Code (`.claude/`) para quem quiser rodar parte do trabalho pelo OpenCode, usando um provedor de modelo gratuito.

## O que existe aqui
- `agents/` — mesmos 14 agents do Claude Code, adaptados pro formato do OpenCode (`mode`, `tools`, `permission`)
- `commands/` — mesmos 9 slash commands
- `../AGENTS.md` — equivalente ao `CLAUDE.md`
- `../opencode.json` — configuração raiz

## Como configurar um provedor gratuito
Edite `opencode.json` na raiz e adicione o bloco `provider` com a opção escolhida:

**Opção 1 — Ollama local (100% grátis, roda na sua máquina, sem internet):**
```bash
# instale o Ollama (ollama.com) e baixe um modelo, ex:
ollama pull qwen2.5-coder:7b
```
```json
{
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen2.5-coder:7b": {} }
    }
  }
}
```

**Opção 2 — Groq (free tier generoso, nuvem, precisa de conta grátis em console.groq.com):**
```json
{
  "provider": {
    "groq": {
      "npm": "@ai-sdk/groq",
      "options": { "apiKey": "{env:GROQ_API_KEY}" },
      "models": { "llama-3.3-70b-versatile": {} }
    }
  }
}
```

Depois de configurar, defina o modelo default do agent orquestrador/subagents em `opencode.json` (`agent.<nome>.model: "provider/modelo"`), ou escolha na hora pela extensão do VS Code.

## Uso pela extensão do VS Code
Abra a extensão do OpenCode apontando para esta mesma pasta do projeto — ela lê `AGENTS.md`, `opencode.json` e `.opencode/agents/*.md` automaticamente. Não é preciso "chamar por API" manualmente: você conversa com o agent normalmente na extensão, igual ao Claude Code, só que o motor por trás é o provedor que você configurou acima.

## Recomendação de uso
Use o OpenCode (com modelo gratuito) para tasks mecânicas/repetitivas — ex: escrever testes adicionais, gerar componentes de UI simples, refatorações pequenas. Mantenha o Claude Code para arquitetura, segurança (RLS, pagamentos, criptografia) e qualquer decisão que precise de mais confiabilidade do que um modelo gratuito costuma entregar.
