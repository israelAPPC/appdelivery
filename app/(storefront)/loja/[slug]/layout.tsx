import type { Metadata } from "next";

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

/**
 * Layout da vitrine de cada loja: liga o manifest.json dinâmico (gerado por
 * `manifest.json/route.ts`) para que o PWA seja instalável com a
 * identidade (nome/ícone) da própria loja.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return {
    manifest: `/loja/${params.slug}/manifest.json`,
  };
}

export default function StoreLayout({ children }: Props) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
