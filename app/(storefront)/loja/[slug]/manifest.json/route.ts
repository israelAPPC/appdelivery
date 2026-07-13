import { NextResponse } from "next/server";
import { getStoreBySlug } from "@/app/lib/storefront-data";

/**
 * Manifest.json dinâmico por loja (Task 2.3).
 *
 * Sempre retorna um manifest válido (200), mesmo quando a loja não existe
 * ou não tem logo cadastrada — nunca deixa o manifest quebrar (CLAUDE.md /
 * regra de frontend). Ícone padrão do sistema em `public/icons/default-icon.svg`
 * é usado como fallback.
 */

const DEFAULT_ICON_PATH = "/icons/default-icon.svg";

// Cores do tema seguindo os tokens de DESIGN.md (base neutra quente +
// destaque terracota). Manifest.json não suporta `hsl(var(--x))`, então
// convertemos os valores de `app/globals.css` (light mode) para hex aqui —
// única exceção onde um valor de cor "fixo" é aceitável, pois é um artefato
// estático (não um componente React) e deve refletir exatamente os tokens.
const THEME_COLOR = "#D95626"; // --accent (light): hsl(16 70% 50%)
const BACKGROUND_COLOR = "#FAF8F5"; // --background (light): hsl(40 20% 98%)

type RouteParams = { params: { slug: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  const store = await getStoreBySlug(params.slug);

  const name = store?.name ?? "DeliveryPróprio";
  const shortName = name.length > 12 ? `${name.slice(0, 12)}…` : name;
  const iconSrc = store?.logoUrl ?? DEFAULT_ICON_PATH;

  const manifest = {
    name,
    short_name: shortName,
    start_url: `/loja/${params.slug}`,
    scope: `/loja/${params.slug}`,
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      {
        src: iconSrc,
        sizes: "512x512",
        type: store?.logoUrl ? "image/png" : "image/svg+xml",
        purpose: "any",
      },
      {
        src: iconSrc,
        sizes: "192x192",
        type: store?.logoUrl ? "image/png" : "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    status: 200,
    headers: { "Content-Type": "application/manifest+json" },
  });
}
