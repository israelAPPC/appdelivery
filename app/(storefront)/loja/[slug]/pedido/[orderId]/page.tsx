import { notFound } from "next/navigation";
import { getOrderForStorefront, getStoreBySlug } from "@/app/lib/storefront-data";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/app/lib/orders";
import { ProductReviewForm } from "./product-review-form";

type PageProps = {
  params: { slug: string; orderId: string };
};

// Status do pedido pode mudar a qualquer momento (painel do lojista) —
// sempre renderizado sob demanda, nunca cacheado estaticamente.
export const dynamic = "force-dynamic";

const ORDER_STATUS_FLOW: OrderStatus[] = ["recebido", "preparo", "entrega", "concluido"];

export default async function OrderTrackingPage({ params }: PageProps) {
  const store = await getStoreBySlug(params.slug);
  if (!store) {
    notFound();
  }

  const order = await getOrderForStorefront(params.orderId, store.id);
  if (!order) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-24 pt-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Pedido #{order.order_number}</h1>
        <p className="text-sm text-muted-foreground">{store.name}</p>
      </header>

      <OrderStatusStepper status={order.status} />

      {order.status === "concluido" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Avalie os produtos deste pedido
          </h2>
          <div className="flex flex-col gap-3">
            {order.items.map((item) => (
              <ProductReviewForm
                key={item.productId}
                productId={item.productId}
                productName={item.name}
                orderId={order.id}
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          Assim que seu pedido for concluído, você poderá avaliar os produtos aqui.
        </p>
      )}
    </main>
  );
}

function OrderStatusStepper({ status }: { status: OrderStatus }) {
  const currentIndex = ORDER_STATUS_FLOW.indexOf(status);

  return (
    <ol className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      {ORDER_STATUS_FLOW.map((step, index) => {
        const isDone = index <= currentIndex;
        return (
          <li key={step} className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${isDone ? "bg-success" : "bg-muted"}`}
              aria-hidden
            />
            <span className={isDone ? "font-medium text-foreground" : "text-muted-foreground"}>
              {ORDER_STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
