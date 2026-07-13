# mercadopago-mcp

MCP server local para integração com o Mercado Pago Checkout Pro durante o desenvolvimento do app-delivery.

## Tools expostas
- `create_payment_preference` — cria uma preferência de pagamento (link de checkout) para um pedido
- `get_payment_status` — consulta o status de um pagamento pelo `payment_id`
- `simulate_webhook` — simula o envio de um webhook contra o endpoint local, para testar o fluxo de confirmação sem esperar um pagamento real

## Instalação

```bash
cd .mcp/mercadopago-mcp
npm install @modelcontextprotocol/sdk
```

Defina a variável de ambiente `MERCADOPAGO_ACCESS_TOKEN` (use a credencial de **TEST** do Mercado Pago em desenvolvimento — nunca a de produção).

## Configuração — Claude Code
Adicione ao `.mcp.json` na raiz do projeto:

```json
{
  "mcpServers": {
    "mercadopago": {
      "command": "npx",
      "args": ["tsx", ".mcp/mercadopago-mcp/index.ts"],
      "env": {
        "MERCADOPAGO_ACCESS_TOKEN": "${MERCADOPAGO_ACCESS_TOKEN}"
      }
    }
  }
}
```

## Configuração — OpenCode
Adicione ao `opencode.json`:

```json
{
  "mcp": {
    "mercadopago": {
      "type": "local",
      "command": ["npx", "tsx", ".mcp/mercadopago-mcp/index.ts"],
      "environment": {
        "MERCADOPAGO_ACCESS_TOKEN": "${MERCADOPAGO_ACCESS_TOKEN}"
      }
    }
  }
}
```

## Segurança
- Nunca use o `MERCADOPAGO_ACCESS_TOKEN` de produção durante o desenvolvimento — use sempre a credencial de teste (sandbox) do Mercado Pago.
- Este MCP não deve ser usado para processar pagamentos reais fora do fluxo de checkout da aplicação — é uma ferramenta de apoio ao desenvolvimento e depuração.
