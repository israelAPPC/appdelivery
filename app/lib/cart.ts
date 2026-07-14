/**
 * Regras puras do carrinho (adicionar/remover/atualizar item, subtotal).
 * Sem dependência de DOM/localStorage — a persistência (client-side) é uma
 * preocupação separada, tratada no componente de carrinho.
 */

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

/**
 * Adiciona um item ao carrinho. Se o produto já existe, soma a quantidade
 * em vez de duplicar a linha.
 */
export function addItemToCart(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((existingItem) => existingItem.productId === item.productId);

  if (existing) {
    return items.map((existingItem) =>
      existingItem.productId === item.productId
        ? { ...existingItem, quantity: existingItem.quantity + item.quantity }
        : existingItem,
    );
  }

  return [...items, item];
}

/** Remove completamente um item do carrinho pelo `productId`. */
export function removeItemFromCart(items: CartItem[], productId: string): CartItem[] {
  return items.filter((item) => item.productId !== productId);
}

/**
 * Atualiza a quantidade de um item. Quantidade <= 0 remove o item do
 * carrinho (nunca deixa quantidade negativa ou zero "pendurada").
 */
export function updateItemQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  if (quantity <= 0) {
    return removeItemFromCart(items, productId);
  }

  return items.map((item) => (item.productId === productId ? { ...item, quantity } : item));
}

/** Soma `price * quantity` de todos os itens do carrinho. */
export function calculateCartSubtotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}
