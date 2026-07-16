"use client";

import { useEffect, useState } from "react";
import { PAYMENT_STATUS_LABEL, type Order } from "@/app/lib/orders";
import { authenticatedFetch } from "@/app/lib/authenticated-fetch";
import { useAdminSession } from "@/app/lib/admin-session-context";

/**
 * app/(admin)/pedidos/[id]/imprimir/page.tsx
 *
 * Tela de impressao de comanda do pedido (Task 4.2), pensada para impressora
 * termica ou folha A4 — layout compacto, legivel, e pronto para
 * `window.print()`.
 *
 * Regras (CLAUDE.md / frontend.md):
 *  - Endereco de entrega SO aparece quando `fulfillment_type === 'delivery'`
 *    — pedido de retirada (`pickup`) nunca mostra esse campo.
 *  - CSS `@media print` esconde chrome do app (botao "Imprimir") e forca
 *    fundo branco / texto preto na comanda impressa, para nao desperdicar
 *    tinta/ficar ilegivel no papel — a tela normal continua usando os
 *    tokens Tailwind do projeto (nunca cor fixa fora de `@media print`).
 *
 * Nota de implementacao: nao existe (ainda) uma rota `GET /api/orders/:id`
 * de pedido unico — apenas `GET /api/orders?storeId=` (lista) e
 * `PATCH /api/orders/:id`. Por isso esta pagina reaproveita a rota de lista
 * (ja filtrada por `store_id`/RLS) e localiza o pedido pelo `id` da URL, e
 * `GET /api/store?storeId=` para o nome da loja. `storeId`/`accessToken`
 * vem do Context compartilhado do painel (`useAdminSession`, ver
 * `app/lib/admin-session-context.tsx`).
 */

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatAddress(order: Order): string {
  if (!order.delivery_address) return "";
  const { street, number, complement, neighborhood, city } = order.delivery_address;
  return [`${street}, ${number}`, complement, neighborhood, city].filter(Boolean).join(" - ");
}

function paymentLabel(order: Order): string {
  if (order.payment_method === "on_delivery") {
    return order.fulfillment_type === "pickup" ? "Pagar na retirada" : "Pagar na entrega";
  }
  // mp_online
  if (order.payment_status === "paid") return "Mercado Pago — Pago";
  if (order.payment_status === "pending") return "Mercado Pago — Aguardando pagamento";
  return `Mercado Pago — ${PAYMENT_STATUS_LABEL[order.payment_status]}`;
}

export default function ImprimirComandaPage({ params }: { params: { id: string } }) {
  const orderId = params.id;

  const { storeId, accessToken } = useAdminSession();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId || !accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      authenticatedFetch(`/api/store?storeId=${encodeURIComponent(storeId)}`),
      authenticatedFetch(`/api/orders?storeId=${encodeURIComponent(storeId)}`),
    ])
      .then(async ([storeResponse, ordersResponse]) => {
        if (!storeResponse.ok) {
          const body = (await storeResponse.json()) as { error?: string };
          throw new Error(body.error ?? "Nao foi possivel carregar os dados da loja.");
        }
        if (!ordersResponse.ok) {
          const body = (await ordersResponse.json()) as { error?: string };
          throw new Error(body.error ?? "Nao foi possivel carregar o pedido.");
        }

        const storeBody = (await storeResponse.json()) as { store: { name: string } };
        const ordersBody = (await ordersResponse.json()) as { orders: Order[] };
        const found = ordersBody.orders.find((item) => item.id === orderId) ?? null;

        return { storeName: storeBody.store.name, order: found };
      })
      .then((result) => {
        if (cancelled) return;
        setStoreName(result.storeName);
        setOrder(result.order);
        if (!result.order) setError("Pedido nao encontrado.");
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
  }, [storeId, accessToken, orderId]);

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-semibold text-foreground">Comanda</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sessão da loja não encontrada. Faça login novamente.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-muted-foreground">Carregando comanda...</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-semibold text-foreground">Comanda</h1>
          <p role="alert" className="mt-2 text-sm text-danger">
            {error ?? "Pedido não encontrado."}
          </p>
        </div>
      </main>
    );
  }

  const address = order.fulfillment_type === "delivery" ? formatAddress(order) : null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 print:min-h-0 print:bg-white print:px-0 print:py-0 print:text-black">
      <div className="mx-auto max-w-md space-y-4 print:max-w-none">
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 print:hidden"
        >
          Imprimir
        </button>

        <div
          data-testid="comanda"
          className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none"
        >
          <header className="border-b border-border pb-3 text-center print:border-black">
            <h1 className="text-base font-semibold text-foreground print:text-black">{storeName}</h1>
            <p className="mt-1 font-medium text-foreground print:text-black">Pedido #{order.order_number}</p>
          </header>

          <section className="mt-3 border-b border-border pb-3 print:border-black">
            <p className="font-medium text-foreground print:text-black">
              {order.fulfillment_type === "pickup" ? "Retirada no local" : "Entrega"}
            </p>
            <p className="text-foreground print:text-black">Cliente: {order.customer_name}</p>
            <p className="text-muted-foreground print:text-black">{order.customer_phone}</p>
            {address && (
              <p data-testid="comanda-address" className="mt-1 text-foreground print:text-black">
                Endereço: {address}
              </p>
            )}
          </section>

          <section className="mt-3 border-b border-border pb-3 print:border-black">
            <p className="font-medium text-foreground print:text-black">Itens</p>
            <ul className="mt-1 space-y-1">
              {order.items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center justify-between text-foreground print:text-black"
                >
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-foreground print:text-black">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-foreground print:text-black">
              <span>Frete</span>
              <span>{formatCurrency(order.shipping_cost)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between text-foreground print:text-black">
                <span>Desconto</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-semibold text-foreground print:text-black">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
            <p className="mt-2 text-foreground print:text-black">Pagamento: {paymentLabel(order)}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
