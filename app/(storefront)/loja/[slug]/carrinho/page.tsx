"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  calculateCartSubtotal,
  removeItemFromCart,
  updateItemQuantity,
  type CartItem,
} from "@/app/lib/cart";

/**
 * Carrinho do storefront (mobile-first — ver DESIGN.md).
 *
 * O cálculo de frete NUNCA é feito neste componente: apenas consumimos o
 * endpoint `/api/shipping/estimate`, que por sua vez usa exclusivamente
 * `app/lib/calculate-shipping.ts` (fonte única da regra de negócio).
 *
 * `shippingCost === null` bloqueia o avanço do pedido com mensagem clara —
 * nunca tratamos como frete grátis nem deixamos passar `NaN`.
 */

type FulfillmentType = "delivery" | "pickup";

type ShippingEstimate =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; shippingCost: number; distanceKm: number | null }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function cartStorageKey(storeSlug: string) {
  return `app-delivery:cart:${storeSlug}`;
}

function loadCartFromStorage(storeSlug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cartStorageKey(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCartToStorage(storeSlug: string, items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cartStorageKey(storeSlug), JSON.stringify(items));
}

export default function CartPage() {
  const params = useParams<{ slug: string }>();
  const storeSlug = params.slug;

  const [items, setItems] = useState<CartItem[]>([]);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("delivery");
  const [address, setAddress] = useState("");
  const [shipping, setShipping] = useState<ShippingEstimate>({ status: "idle" });

  useEffect(() => {
    setItems(loadCartFromStorage(storeSlug));
  }, [storeSlug]);

  const subtotal = useMemo(() => calculateCartSubtotal(items), [items]);
  const total = shipping.status === "success" ? subtotal + shipping.shippingCost : subtotal;

  function updateQuantity(productId: string, quantity: number) {
    const next = updateItemQuantity(items, productId, quantity);
    setItems(next);
    saveCartToStorage(storeSlug, next);
  }

  function removeItem(productId: string) {
    const next = removeItemFromCart(items, productId);
    setItems(next);
    saveCartToStorage(storeSlug, next);
  }

  async function handleCalculateShipping() {
    if (fulfillmentType === "pickup") {
      setShipping({ status: "success", shippingCost: 0, distanceKm: 0 });
      return;
    }

    if (!address.trim()) {
      setShipping({ status: "unavailable", message: "Informe o endereço de entrega." });
      return;
    }

    setShipping({ status: "loading" });

    try {
      const response = await fetch("/api/shipping/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeSlug, address, fulfillmentType }),
      });

      const data = await response.json();

      if (!response.ok || data.shippingCost === null || data.shippingCost === undefined) {
        setShipping({
          status: "unavailable",
          message: data.error ?? "Não foi possível calcular o frete para este endereço.",
        });
        return;
      }

      setShipping({
        status: "success",
        shippingCost: data.shippingCost,
        distanceKm: data.distanceKm ?? null,
      });
    } catch {
      setShipping({
        status: "error",
        message: "Erro ao calcular o frete. Tente novamente em instantes.",
      });
    }
  }

  const canAdvance = items.length > 0 && shipping.status === "success";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-32 pt-6">
      <h1 className="text-lg font-semibold text-foreground">Carrinho</h1>

      {items.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          Seu carrinho está vazio.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex flex-1 flex-col gap-1">
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
              </div>
              <QuantityStepper
                quantity={item.quantity}
                onDecrease={() => updateQuantity(item.productId, item.quantity - 1)}
                onIncrease={() => updateQuantity(item.productId, item.quantity + 1)}
              />
              <button
                type="button"
                onClick={() => removeItem(item.productId)}
                className="text-sm text-danger"
                aria-label={`Remover ${item.name}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Entrega</h2>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFulfillmentType("delivery")}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
              fulfillmentType === "delivery"
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Entrega
          </button>
          <button
            type="button"
            onClick={() => setFulfillmentType("pickup")}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
              fulfillmentType === "pickup"
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Retirada
          </button>
        </div>

        {fulfillmentType === "delivery" && (
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Endereço de entrega
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua, número, bairro, cidade"
              className="rounded border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
        )}

        <button
          type="button"
          onClick={handleCalculateShipping}
          disabled={shipping.status === "loading"}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {shipping.status === "loading" ? "Calculando..." : "Calcular frete"}
        </button>

        {(shipping.status === "unavailable" || shipping.status === "error") && (
          <p className="text-sm text-danger">{shipping.message}</p>
        )}

        {shipping.status === "success" && (
          <p className="text-sm text-success">
            Frete: {formatCurrency(shipping.shippingCost)}
            {shipping.distanceKm !== null ? ` (${shipping.distanceKm.toFixed(1)} km)` : ""}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Frete</span>
          <span>{shipping.status === "success" ? formatCurrency(shipping.shippingCost) : "—"}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-foreground">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </section>

      <button
        type="button"
        disabled={!canAdvance}
        className="fixed bottom-4 left-4 right-4 mx-auto max-w-lg rounded bg-accent px-4 py-3 text-center font-semibold text-accent-foreground disabled:opacity-50"
      >
        Continuar para pagamento
      </button>
    </main>
  );
}

function QuantityStepper({
  quantity,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDecrease}
        aria-label="Diminuir quantidade"
        className="h-7 w-7 rounded bg-muted text-muted-foreground"
      >
        −
      </button>
      <span className="w-4 text-center text-sm text-foreground">{quantity}</span>
      <button
        type="button"
        onClick={onIncrease}
        aria-label="Aumentar quantidade"
        className="h-7 w-7 rounded bg-muted text-muted-foreground"
      >
        +
      </button>
    </div>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
