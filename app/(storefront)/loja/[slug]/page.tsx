import { notFound } from "next/navigation";
import {
  getProductReviewSummaries,
  getStoreBySlug,
  getStoreProducts,
  type ProductReviewSummary,
  type StorefrontProduct,
} from "@/app/lib/storefront-data";

type PageProps = {
  params: { slug: string };
};

// PWA/vitrine de cada loja é sempre renderizada sob demanda (dados podem
// mudar a qualquer momento: disponibilidade de produto, loja pausada, etc).
export const dynamic = "force-dynamic";

export default async function StorePage({ params }: PageProps) {
  const store = await getStoreBySlug(params.slug);

  if (!store) {
    notFound();
  }

  const products = await getStoreProducts(store.id);
  const reviewSummaries = await getProductReviewSummaries(products.map((product) => product.id));
  const productsByCategory = groupByCategory(products);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-24 pt-6">
      <StoreHeader name={store.name} logoUrl={store.logoUrl} />

      {products.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum produto disponível no momento.
        </p>
      ) : (
        Object.entries(productsByCategory).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  reviewSummary={reviewSummaries[product.id] ?? null}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

function StoreHeader({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL de logo é dinâmica por
          // loja (Supabase Storage), sem domínios configurados em next.config.js.
          <img src={logoUrl} alt={`Logo de ${name}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex flex-col">
        <h1 className="text-lg font-semibold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">Cardápio</p>
      </div>
    </header>
  );
}

function ProductCard({
  product,
  reviewSummary,
}: {
  product: StorefrontProduct;
  reviewSummary: ProductReviewSummary | null;
}) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {product.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL de foto é dinâmica por
          // produto (Supabase Storage), sem domínios configurados em next.config.js.
          <img src={product.photoUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Sem foto
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-medium text-foreground">{product.name}</p>
        <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
        <p className="text-xs text-muted-foreground">{formatReviewSummary(reviewSummary)}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
      >
        Adicionar
      </button>
    </article>
  );
}

function formatReviewSummary(reviewSummary: ProductReviewSummary | null): string {
  if (!reviewSummary || reviewSummary.totalReviews === 0 || reviewSummary.averageRating === null) {
    return "Sem avaliações ainda";
  }
  return `★ ${reviewSummary.averageRating.toFixed(1)} (${reviewSummary.totalReviews} avaliaç${
    reviewSummary.totalReviews === 1 ? "ão" : "ões"
  })`;
}

function groupByCategory(products: StorefrontProduct[]): Record<string, StorefrontProduct[]> {
  return products.reduce<Record<string, StorefrontProduct[]>>((acc, product) => {
    const category = product.category ?? "Outros";
    acc[category] = acc[category] ? [...acc[category], product] : [product];
    return acc;
  }, {});
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
