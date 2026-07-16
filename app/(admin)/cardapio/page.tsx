"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/app/lib/authenticated-fetch";
import { useAdminSession } from "@/app/lib/admin-session-context";

/**
 * app/(admin)/cardapio/page.tsx
 *
 * Tela do painel admin para o lojista gerenciar o cardapio (catalogo de
 * produtos) — CRUD sobre `/api/products` e `/api/products/[id]`, que ja
 * existem e estao testados.
 *
 * `storeId`/`accessToken` vem do Context compartilhado do painel
 * (`useAdminSession`, ver `app/lib/admin-session-context.tsx`).
 */

type Product = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  category: string | null;
  photo_url: string | null;
  available: boolean;
  created_at: string;
  updated_at: string;
};

type ProductFormState = {
  name: string;
  price: string;
  category: string;
  photoUrl: string;
  available: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: "",
  price: "",
  category: "",
  photoUrl: "",
  available: true,
};

export default function CardapioPage() {
  const { storeId, accessToken } = useAdminSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ProductFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadProducts(currentStoreId: string, token: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(`/api/products?storeId=${encodeURIComponent(currentStoreId)}`);
      const body = (await response.json()) as { products?: Product[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Nao foi possivel carregar o cardapio.");
      }
      setProducts(body.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!storeId || !accessToken) return;
    void loadProducts(storeId, accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, accessToken]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !accessToken) return;

    const priceValue = Number(createForm.price);
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authenticatedFetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId,
          name: createForm.name,
          price: priceValue,
          category: createForm.category || undefined,
          photoUrl: createForm.photoUrl || undefined,
          available: createForm.available,
        }),
      });

      const body = (await response.json()) as { product?: Product; error?: string };
      if (!response.ok || !body.product) {
        throw new Error(body.error ?? "Nao foi possivel criar o produto.");
      }

      setProducts((prev) => [...prev, body.product as Product].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateForm(EMPTY_FORM);
      setMessage("Produto criado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      price: String(product.price),
      category: product.category ?? "",
      photoUrl: product.photo_url ?? "",
      available: product.available,
    });
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault();
    if (!accessToken) return;

    const priceValue = Number(editForm.price);
    setSavingEdit(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authenticatedFetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          price: priceValue,
          category: editForm.category || undefined,
          photoUrl: editForm.photoUrl || undefined,
          available: editForm.available,
        }),
      });

      const body = (await response.json()) as { product?: Product; error?: string };
      if (!response.ok || !body.product) {
        throw new Error(body.error ?? "Nao foi possivel atualizar o produto.");
      }

      setProducts((prev) => prev.map((product) => (product.id === productId ? (body.product as Product) : product)));
      setMessage("Produto atualizado com sucesso.");
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(productId: string) {
    if (!accessToken) return;

    setError(null);
    setMessage(null);

    try {
      const response = await authenticatedFetch(`/api/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Nao foi possivel remover o produto.");
      }

      setProducts((prev) => prev.filter((product) => product.id !== productId));
      setMessage("Produto removido com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    }
  }

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold text-foreground">Cardápio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sessão da loja não encontrada. Faça login novamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Cardápio</h1>

        {message && (
          <p role="status" className="text-sm text-success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-medium text-foreground sm:text-lg">Novo produto</h2>

          <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-name" className="block text-sm font-medium text-foreground">
                Nome
              </label>
              <input
                id="new-name"
                type="text"
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="new-price" className="block text-sm font-medium text-foreground">
                Preço
              </label>
              <input
                id="new-price"
                type="number"
                step="0.01"
                min="0.01"
                value={createForm.price}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, price: event.target.value }))}
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="new-category" className="block text-sm font-medium text-foreground">
                Categoria
              </label>
              <input
                id="new-category"
                type="text"
                value={createForm.category}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="new-photo-url" className="block text-sm font-medium text-foreground">
                URL da foto
              </label>
              <input
                id="new-photo-url"
                type="text"
                value={createForm.photoUrl}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, photoUrl: event.target.value }))}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="new-available"
                type="checkbox"
                checked={createForm.available}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, available: event.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="new-available" className="text-sm text-foreground">
                Disponível
              </label>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Criando..." : "Adicionar produto"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-medium text-foreground sm:text-lg">Produtos</h2>

          {loading && <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>}

          {!loading && products.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
          )}

          <ul className="mt-4 space-y-3">
            {products.map((product) => (
              <li key={product.id} className="rounded-lg border border-border p-3 sm:p-4">
                {editingId === product.id ? (
                  <form
                    onSubmit={(event) => handleEditSubmit(event, product.id)}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  >
                    <div>
                      <label htmlFor={`edit-name-${product.id}`} className="block text-sm font-medium text-foreground">
                        Nome
                      </label>
                      <input
                        id={`edit-name-${product.id}`}
                        type="text"
                        value={editForm.name}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor={`edit-price-${product.id}`} className="block text-sm font-medium text-foreground">
                        Preço
                      </label>
                      <input
                        id={`edit-price-${product.id}`}
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editForm.price}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, price: event.target.value }))}
                        required
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor={`edit-category-${product.id}`} className="block text-sm font-medium text-foreground">
                        Categoria
                      </label>
                      <input
                        id={`edit-category-${product.id}`}
                        type="text"
                        value={editForm.category}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor={`edit-photo-url-${product.id}`} className="block text-sm font-medium text-foreground">
                        URL da foto
                      </label>
                      <input
                        id={`edit-photo-url-${product.id}`}
                        type="text"
                        value={editForm.photoUrl}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, photoUrl: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id={`edit-available-${product.id}`}
                        type="checkbox"
                        checked={editForm.available}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, available: event.target.checked }))}
                        className="h-4 w-4 rounded border-border"
                      />
                      <label htmlFor={`edit-available-${product.id}`} className="text-sm text-foreground">
                        Disponível
                      </label>
                    </div>

                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {savingEdit ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:opacity-90"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {product.name}
                        {!product.available && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            indisponível
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        R$ {product.price.toFixed(2)}
                        {product.category ? ` · ${product.category}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(product)}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:opacity-90"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
