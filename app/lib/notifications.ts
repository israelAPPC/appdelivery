import "server-only";
import webPush from "web-push";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/app/lib/orders";

/**
 * app/lib/notifications.ts
 *
 * Notificacao push nativa (Web Push API / VAPID) de mudanca de status do
 * pedido (Task 4.3).
 *
 * Nao existe login de cliente final no MVP (ver SPEC.md): as subscriptions
 * de push sao vinculadas a um `order_id` (tabela `push_subscriptions`,
 * migration 0012), nunca a um usuario logado. Este arquivo e o UNICO lugar
 * que envia push — nunca duplicar esta logica em route handlers
 * (convencoes-gerais.md).
 *
 * `sendOrderStatusNotification` e chamada pelo route handler PATCH de
 * `/api/orders/[id]` apos o status ja ter sido persistido com sucesso.
 * NUNCA lanca excecao: qualquer falha (subscription expirada, erro de rede
 * do provedor, erro ao consultar o banco) e apenas logada — a mudanca de
 * status ja aconteceu e nao pode ser derrubada por uma falha de
 * notificacao (teste critico do PLAN.md).
 */

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@app-delivery.local";

  if (!publicKey || !privateKey) {
    console.error(
      "[app/lib/notifications] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY nao configuradas — notificacao de push ignorada.",
    );
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Busca as subscriptions de push vinculadas ao pedido e envia, para cada
 * uma, uma notificacao simples com o novo status. Envia no maximo 1
 * notificacao por subscription cadastrada (nunca reenvia/duplica). Nunca
 * lanca excecao — falhas sao apenas logadas, para nao interromper quem
 * chamou (o PATCH de status do pedido ja foi persistido antes desta
 * chamada).
 */
export async function sendOrderStatusNotification(orderId: string, newStatus: string): Promise<void> {
  try {
    if (!ensureVapidConfigured()) return;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("order_id", orderId);

    if (error) {
      console.error("[app/lib/notifications] Falha ao buscar subscriptions do pedido", { orderId, error });
      return;
    }

    const subscriptions = (data ?? []) as PushSubscriptionRow[];
    if (subscriptions.length === 0) return;

    const label = ORDER_STATUS_LABEL[newStatus as OrderStatus] ?? newStatus;
    const payload = JSON.stringify({
      title: "Atualizacao do seu pedido",
      body: `Seu pedido está: ${label}`,
      orderId,
      status: newStatus,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (sendError) {
          // Subscription expirada (410 Gone), erro de rede, etc. — nunca
          // propaga: apenas loga e segue para as demais subscriptions.
          console.error("[app/lib/notifications] Falha ao enviar notificacao de push", {
            orderId,
            endpoint: subscription.endpoint,
            error: sendError,
          });
        }
      }),
    );
  } catch (unexpectedError) {
    // Defesa em profundidade final: nenhuma excecao inesperada desta funcao
    // pode chegar ao chamador (regra desta task/PLAN.md).
    console.error("[app/lib/notifications] Erro inesperado ao notificar mudanca de status", {
      orderId,
      newStatus,
      error: unexpectedError,
    });
  }
}
