/**
 * app/lib/orders.ts
 *
 * Tipos e logica pura do painel de pedidos (Task 3.3).
 *
 * Contrato da tabela `orders` definido pela Task 3.2 (backend-payments):
 *   id, store_id, order_number, customer_name, customer_phone,
 *   delivery_address (nullable), items (jsonb), subtotal, shipping_cost,
 *   discount, total, payment_method, payment_status, fulfillment_type,
 *   status, created_at.
 *
 * Este arquivo nao acessa o banco diretamente — apenas define tipos e
 * funcoes puras usadas pelo painel (`app/(admin)/pedidos/page.tsx`) para
 * aplicar eventos de Realtime (INSERT/UPDATE/DELETE) ao estado em memoria,
 * sem depender de reload de pagina.
 */

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type PaymentMethod = "mp_online" | "on_delivery";
export type PaymentStatus = "pending_offline" | "pending" | "paid" | "failed";
export type FulfillmentType = "delivery" | "pickup";
export type OrderStatus = "recebido" | "preparo" | "entrega" | "concluido";

/** Item de um pedido, conforme `comment on column public.orders.items` (migration 0009). */
export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

/** Endereco de entrega estruturado — `null` para pedidos de retirada (`pickup`). */
export type DeliveryAddress = {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  reference?: string | null;
} | null;

/** Shape minimo estrutural validado de `DeliveryAddress` (sem os `null`). */
export type StructuredDeliveryAddress = NonNullable<DeliveryAddress>;

/**
 * Valida o SHAPE minimo de um endereco de entrega recebido de input externo
 * (ex.: body de `/api/checkout`): `street` e `number` sao obrigatorios (string
 * nao vazia); os demais campos, se presentes, devem ser string ou omitidos.
 * Nunca confia em um objeto truthy qualquer vindo do client (seguranca.md).
 */
export function isValidDeliveryAddressInput(value: unknown): value is StructuredDeliveryAddress {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  const hasValidStreet = typeof candidate.street === "string" && candidate.street.trim().length > 0;
  const hasValidNumber = typeof candidate.number === "string" && candidate.number.trim().length > 0;
  if (!hasValidStreet || !hasValidNumber) return false;

  const optionalFields = ["complement", "neighborhood", "city", "reference"] as const;
  return optionalFields.every((field) => {
    const fieldValue = candidate[field];
    return fieldValue === undefined || fieldValue === null || typeof fieldValue === "string";
  });
}

/**
 * Compoe uma unica linha de endereco em texto livre a partir dos campos
 * estruturados de `DeliveryAddress`, para uso na geocodificacao
 * (`getCustomerDistanceKm`). Nunca duplicar esta composicao em outro lugar.
 */
export function formatDeliveryAddressForGeocoding(address: StructuredDeliveryAddress): string {
  const parts = [
    `${address.street}, ${address.number}`,
    address.complement,
    address.neighborhood,
    address.city,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join(", ");
}

export type Order = {
  id: string;
  store_id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: DeliveryAddress;
  items: OrderItem[];
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  fulfillment_type: FulfillmentType;
  status: OrderStatus;
  created_at: string;
};

/** Payload minimo de um evento de Realtime do Supabase (`postgres_changes`). */
export type OrderRealtimeEvent =
  | { eventType: "INSERT"; new: Order }
  | { eventType: "UPDATE"; new: Order }
  | { eventType: "DELETE"; old: Pick<Order, "id"> };

/**
 * Converte o payload nativo do Supabase Realtime (`RealtimePostgresChangesPayload<Order>`)
 * para o shape reduzido `OrderRealtimeEvent` usado por `applyOrderRealtimeEvent`.
 * Retorna `null` para eventos incompletos/inesperados (nunca deve acontecer em
 * runtime, mas o payload nativo tipa `new`/`old` como `{}` nos overloads
 * genericos do client, entao validamos o formato antes de repassar adiante).
 */
export function toOrderRealtimeEvent(
  payload: RealtimePostgresChangesPayload<Order>,
): OrderRealtimeEvent | null {
  switch (payload.eventType) {
    case "INSERT":
    case "UPDATE": {
      const record = payload.new as Partial<Order>;
      if (!record.id) return null;
      return { eventType: payload.eventType, new: record as Order };
    }
    case "DELETE": {
      const record = payload.old as Partial<Order>;
      if (!record.id) return null;
      return { eventType: "DELETE", old: { id: record.id } };
    }
    default:
      return null;
  }
}

/** Ordena pedidos do mais recente para o mais antigo por `created_at`. */
export function sortOrdersByCreatedAtDesc(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Aplica um evento de Realtime (`postgres_changes`) a uma lista de pedidos
 * em memoria, retornando uma NOVA lista (nunca muta o array recebido):
 *  - INSERT: adiciona o pedido novo (sem duplicar se o `id` ja existir —
 *    pode acontecer se o fetch inicial e o evento realtime chegarem quase
 *    juntos).
 *  - UPDATE: substitui o pedido existente com o mesmo `id` (ex.: mudanca de
 *    `status` de `preparo` para `entrega`), preservando a posicao/ordenacao
 *    por `created_at`.
 *  - DELETE: remove o pedido com o `id` informado.
 *
 * Nunca faz join/lookup cross-tenant: o filtro por `store_id` e feito na
 * propria subscription do Realtime (`filter: store_id=eq.<storeId>`), esta
 * funcao apenas reflete os eventos que ja chegaram filtrados.
 */
export function applyOrderRealtimeEvent(orders: Order[], event: OrderRealtimeEvent): Order[] {
  switch (event.eventType) {
    case "INSERT": {
      const alreadyExists = orders.some((order) => order.id === event.new.id);
      const next = alreadyExists
        ? orders.map((order) => (order.id === event.new.id ? event.new : order))
        : [...orders, event.new];
      return sortOrdersByCreatedAtDesc(next);
    }
    case "UPDATE": {
      const next = orders.map((order) => (order.id === event.new.id ? { ...order, ...event.new } : order));
      return sortOrdersByCreatedAtDesc(next);
    }
    case "DELETE": {
      return orders.filter((order) => order.id !== event.old.id);
    }
    default:
      return orders;
  }
}

/** Sequencia fixa do fluxo operacional do pedido (Task 3.3 — painel). */
const ORDER_STATUS_FLOW: OrderStatus[] = ["recebido", "preparo", "entrega", "concluido"];

/**
 * Retorna o proximo status operacional do pedido no fluxo
 * recebido -> preparo -> entrega -> concluido, ou `null` quando o pedido
 * ja esta `concluido` (nao ha proximo status). Nunca pula etapas.
 */
export function nextOrderStatus(current: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(current);
  const next = ORDER_STATUS_FLOW[index + 1];
  return next ?? null;
}

/** Rotulo em pt-BR para exibicao do status do pedido. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: "Recebido",
  preparo: "Em preparo",
  entrega: "Em entrega",
  concluido: "Concluído",
};

/** Rotulo em pt-BR para exibicao do status de pagamento. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_offline: "A pagar na entrega",
  pending: "Pagamento pendente",
  paid: "Pago",
  failed: "Pagamento falhou",
};

/**
 * Token de cor (DESIGN.md) associado ao status de pagamento — nunca usar
 * cor fora dos tokens (`success`/`danger`/`muted`) mapeados no Tailwind.
 */
export function paymentStatusColorToken(status: PaymentStatus): "success" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "failed") return "danger";
  return "muted";
}
