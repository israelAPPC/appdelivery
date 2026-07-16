"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";
import {
  applyOrderRealtimeEvent,
  nextOrderStatus,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  paymentStatusColorToken,
  sortOrdersByCreatedAtDesc,
  toOrderRealtimeEvent,
  type Order,
} from "@/app/lib/orders";

/**
 * app/(admin)/pedidos/page.tsx
 *
 * Painel de pedidos em tempo real (Task 3.3). Lista inicial via
 * `/api/orders` (que checa a permissao `orders` no backend) e depois se
 * mantem atualizado via Supabase Realtime, sempre filtrado por `store_id`
 * (nunca cross-tenant) — nenhuma mudanca de pedido depende de reload de
 * pagina.
 *
 * Nota de implementacao: como o contexto/hook de sessao autenticada
 * compartilhado do painel admin ainda nao existe, esta pagina le `storeId`
 * e `accessToken` de `localStorage` (mesmo padrao placeholder usado em
 * `app/(admin)/configuracoes/integracoes/page.tsx`), ate a task de
 * auth/layout do painel definir o padrao definitivo de sessao no client.
 */

const TOKEN_COLOR_CLASS: Record<"success" | "danger" | "muted", string> = {
  success: "bg-success text-background",
  danger: "bg-danger text-background",
  muted: "bg-muted text-muted-foreground",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatAddress(order: Order): string | null {
  if (order.fulfillment_type !== "delivery" || !order.delivery_address) return null;
  const { street, number, complement, neighborhood, city } = order.delivery_address;
  return [`${street}, ${number}`, complement, neighborhood, city].filter(Boolean).join(" - ");
}

export default function PedidosPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStoreId(window.localStorage.getItem("app_delivery_store_id"));
    setAccessToken(window.localStorage.getItem("app_delivery_access_token"));
  }, []);

  // Carrega a lista inicial de pedidos (respeita permissao `orders` no backend).
  useEffect(() => {
    if (!storeId || !accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setForbidden(false);

    fetch(`/api/orders?storeId=${encodeURIComponent(storeId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (response.status === 403) {
          if (!cancelled) setForbidden(true);
          return null;
        }
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Nao foi possivel carregar os pedidos.");
        }
        return (await response.json()) as { orders: Order[] };
      })
      .then((body) => {
        if (!cancelled && body) setOrders(sortOrdersByCreatedAtDesc(body.orders));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, accessToken]);

  // Subscription de Realtime: mantem a lista atualizada sem reload, sempre
  // filtrada por `store_id` desta loja (nunca cross-tenant).
  useEffect(() => {
    if (!storeId || forbidden) return;

    const channel = supabase
      .channel(`orders-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const event = toOrderRealtimeEvent(payload);
          if (!event) return;
          setOrders((current) => applyOrderRealtimeEvent(current, event));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, forbidden]);

  const hasOrders = useMemo(() => orders.length > 0, [orders]);

  // Avanca o status operacional do pedido (recebido -> preparo -> entrega ->
  // concluido). O reflexo definitivo na tela vem do evento de Realtime, mas
  // atualizamos otimisticamente para feedback imediato ao lojista/funcionario.
  async function handleAdvanceStatus(order: Order) {
    const next = nextOrderStatus(order.status);
    if (!next || !storeId || !accessToken) return;

    const previousOrders = orders;
    setOrders((current) =>
      current.map((item) => (item.id === order.id ? { ...item, status: next } : item)),
    );

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: next, storeId }),
      });

      if (!response.ok) {
        setOrders(previousOrders);
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Nao foi possivel atualizar o status do pedido.");
      }
    } catch {
      setOrders(previousOrders);
      setError("Nao foi possivel atualizar o status do pedido.");
    }
  }

  // Marca um pedido `on_delivery` (pagar na entrega/retirada) como pago,
  // depois que o lojista recebe o dinheiro/pix em maos. Nunca disponivel
  // para pedidos `mp_online` — esses so mudam de status de pagamento via
  // webhook do Mercado Pago (backend rejeita com 400 se tentado por aqui).
  async function handleMarkAsPaid(order: Order) {
    if (!storeId || !accessToken) return;

    const previousOrders = orders;
    setOrders((current) =>
      current.map((item) => (item.id === order.id ? { ...item, payment_status: "paid" } : item)),
    );

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ markAsPaid: true, storeId }),
      });

      if (!response.ok) {
        setOrders(previousOrders);
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Nao foi possivel marcar o pedido como pago.");
      }
    } catch {
      setOrders(previousOrders);
      setError("Nao foi possivel marcar o pedido como pago.");
    }
  }

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sessão da loja não encontrada. Faça login novamente.</p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
          <p role="alert" className="mt-2 text-sm text-danger">
            Você não tem permissão para ver os pedidos desta loja.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Pedidos</h1>

        {loading && <p className="text-sm text-muted-foreground">Carregando pedidos...</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {!loading && !error && !hasOrders && (
          <p className="text-sm text-muted-foreground">Nenhum pedido recebido ainda.</p>
        )}

        {hasOrders && (
          <>
            {/* Desktop/tablet: tabela densa. */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Pedido</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Entrega</th>
                    <th className="px-4 py-3 font-medium">Pagamento</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const next = nextOrderStatus(order.status);
                    const canMarkAsPaid =
                      order.payment_method === "on_delivery" && order.payment_status === "pending_offline";
                    return (
                      <tr key={order.id} data-testid="order-row" className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">#{order.order_number}</td>
                        <td className="px-4 py-3 text-foreground">{order.customer_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {order.fulfillment_type === "pickup" ? "Retirada" : formatAddress(order) ?? "Entrega"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TOKEN_COLOR_CLASS[paymentStatusColorToken(order.payment_status)]}`}
                          >
                            {PAYMENT_STATUS_LABEL[order.payment_status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground" data-testid="order-status">
                          {ORDER_STATUS_LABEL[order.status]}
                        </td>
                        <td className="px-4 py-3 text-foreground">{formatCurrency(order.total)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {next && (
                              <button
                                type="button"
                                data-testid="advance-status-button"
                                onClick={() => handleAdvanceStatus(order)}
                                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                              >
                                Avançar status
                              </button>
                            )}
                            {canMarkAsPaid && (
                              <button
                                type="button"
                                data-testid="mark-as-paid-button"
                                onClick={() => handleMarkAsPaid(order)}
                                className="rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                              >
                                Marcar como pago
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards. */}
            <div className="space-y-3 sm:hidden">
              {orders.map((order) => {
                const next = nextOrderStatus(order.status);
                const canMarkAsPaid =
                  order.payment_method === "on_delivery" && order.payment_status === "pending_offline";
                return (
                  <div
                    key={order.id}
                    data-testid="order-card"
                    className="rounded-xl border border-border bg-surface p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">#{order.order_number}</span>
                      <span className="text-foreground">{formatCurrency(order.total)}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{order.customer_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {order.fulfillment_type === "pickup" ? "Retirada" : formatAddress(order) ?? "Entrega"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TOKEN_COLOR_CLASS[paymentStatusColorToken(order.payment_status)]}`}
                      >
                        {PAYMENT_STATUS_LABEL[order.payment_status]}
                      </span>
                      <span data-testid="order-status" className="text-sm text-foreground">
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    {next && (
                      <button
                        type="button"
                        data-testid="advance-status-button"
                        onClick={() => handleAdvanceStatus(order)}
                        className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:opacity-90"
                      >
                        Avançar status
                      </button>
                    )}
                    {canMarkAsPaid && (
                      <button
                        type="button"
                        data-testid="mark-as-paid-button"
                        onClick={() => handleMarkAsPaid(order)}
                        className="mt-2 w-full rounded-lg bg-success px-3 py-2 text-sm font-medium text-background hover:opacity-90"
                      >
                        Marcar como pago
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
