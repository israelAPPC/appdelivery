#!/usr/bin/env node
/**
 * MCP server para Mercado Pago (Checkout Pro) — app-delivery.
 * Expõe tools para criar preferência de pagamento, consultar status
 * e simular webhook em sandbox, sem sair do Claude Code.
 *
 * Requer: MERCADOPAGO_ACCESS_TOKEN no ambiente (usar credencial de TEST em dev).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MP_BASE_URL = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const server = new Server(
  { name: "mercadopago-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment_preference",
      description:
        "Cria uma preferência de pagamento no Mercado Pago Checkout Pro para um pedido (itens + valor total já calculado, incluindo frete e desconto de cupom).",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "ID do pedido no Supabase" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
              },
              required: ["title", "quantity", "unit_price"],
            },
          },
          notificationUrl: { type: "string", description: "URL do webhook de confirmação" },
        },
        required: ["orderId", "items"],
      },
    },
    {
      name: "get_payment_status",
      description: "Consulta o status atual de um pagamento pelo payment_id do Mercado Pago.",
      inputSchema: {
        type: "object",
        properties: { paymentId: { type: "string" } },
        required: ["paymentId"],
      },
    },
    {
      name: "simulate_webhook",
      description:
        "Simula o envio de um webhook de pagamento (sandbox) contra o endpoint local, para testar o fluxo de confirmação sem esperar um pagamento real.",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string" },
          localWebhookUrl: {
            type: "string",
            description: "Ex: http://localhost:3000/api/webhooks/mercado-pago",
          },
        },
        required: ["paymentId", "localWebhookUrl"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!ACCESS_TOKEN) {
    return {
      content: [{ type: "text", text: "Erro: MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente." }],
      isError: true,
    };
  }

  const { name, arguments: args } = request.params;

  if (name === "create_payment_preference") {
    const { orderId, items, notificationUrl } = args as any;
    const res = await fetch(`${MP_BASE_URL}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        external_reference: orderId,
        notification_url: notificationUrl,
      }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  if (name === "get_payment_status") {
    const { paymentId } = args as any;
    const res = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  if (name === "simulate_webhook") {
    const { paymentId, localWebhookUrl } = args as any;
    const res = await fetch(localWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: paymentId } }),
    });
    return {
      content: [
        { type: "text", text: `Webhook simulado enviado. Status recebido: ${res.status}` },
      ],
    };
  }

  return { content: [{ type: "text", text: `Tool desconhecida: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
