"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { StorePermissions, StoreRole } from "@/app/lib/auth";

/**
 * app/components/admin-nav.tsx
 *
 * Menu de navegacao do painel admin (Task de menu/permissoes). Separado do
 * layout (`app/(admin)/layout.tsx`) para poder ser testado isoladamente
 * (`tests/components/admin-nav.test.tsx`), sem precisar montar o layout
 * inteiro (que le localStorage e faz redirect).
 *
 * Regras de visibilidade dos links (CLAUDE.md / getStorePermissions):
 *  - Admin sempre ve todos os links, independente do valor de `permissions`
 *    (mesma regra de "defesa em profundidade" do backend).
 *  - Funcionario so ve o link de uma secao se a permissao correspondente for
 *    `true`.
 *
 * Esta e apenas a camada de UI (esconder o link) — a protecao real de dados
 * continua nas rotas de API (`getStorePermissions` + RLS), nunca so aqui.
 */

export type AdminNavProps = {
  role: StoreRole | null;
  permissions: StorePermissions | null;
  onLogout: () => void;
};

type NavItem = {
  href: string;
  label: string;
  permissionKey: keyof StorePermissions | null;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/pedidos", label: "Pedidos", permissionKey: "orders" },
  { href: "/cardapio", label: "Cardápio", permissionKey: "catalog" },
  { href: "/financeiro", label: "Financeiro", permissionKey: "financial" },
  { href: "/configuracoes/loja", label: "Dados da loja", permissionKey: "settings" },
  { href: "/configuracoes/integracoes", label: "Integrações", permissionKey: "settings" },
];

function isVisible(item: NavItem, role: StoreRole | null, permissions: StorePermissions | null): boolean {
  if (role === "admin") return true;
  if (!item.permissionKey) return true;
  return permissions?.[item.permissionKey] === true;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ role, permissions, onLogout }: AdminNavProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => isVisible(item, role, permissions));

  return (
    <nav
      data-testid="admin-nav"
      className="print:hidden border-b border-border bg-surface"
      aria-label="Navegação do painel"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <span className="text-sm font-semibold text-foreground">Painel da loja</span>

        {/* Desktop: links inline. */}
        <div className="hidden items-center gap-1 sm:flex">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 ${
                isActive(pathname, item.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={onLogout}
            className="ml-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:opacity-90"
          >
            Sair
          </button>
        </div>

        {/* Mobile: hamburguer. */}
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground sm:hidden"
          aria-expanded={mobileOpen}
          aria-label="Abrir menu"
          onClick={() => setMobileOpen((open) => !open)}
        >
          Menu
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive(pathname, item.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={onLogout}
              className="mt-1 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground hover:opacity-90"
            >
              Sair
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
