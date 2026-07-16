"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminNav from "@/app/components/admin-nav";
import type { StorePermissions, StoreRole } from "@/app/lib/auth";

/**
 * app/(admin)/layout.tsx
 *
 * Layout compartilhado do painel admin: renderiza o menu de navegacao
 * (`AdminNav`) acima de qualquer tela do painel (`/pedidos`, `/cardapio`,
 * `/financeiro`, `/configuracoes/*`, `/pedidos/[id]/imprimir`).
 *
 * Client Component porque a sessao do painel ainda e lida de `localStorage`
 * (mesmo padrao provisorio usado em todas as paginas do admin, ate existir
 * um contexto/hook de sessao compartilhado — ver comentarios em
 * `app/(admin)/pedidos/page.tsx` etc.).
 *
 * Este layout cobre APENAS o caso de sessao totalmente ausente (sem
 * storeId/accessToken) — cada pagina continua com sua propria checagem
 * individual como defesa em profundidade, e a protecao real de dados
 * continua no backend (`getStorePermissions` + RLS), nunca so aqui.
 */

const STORAGE_KEYS = {
  storeId: "app_delivery_store_id",
  accessToken: "app_delivery_access_token",
  role: "app_delivery_role",
  permissions: "app_delivery_permissions",
} as const;

function parsePermissions(raw: string | null): StorePermissions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StorePermissions>;
    return {
      orders: parsed.orders === true,
      catalog: parsed.catalog === true,
      financial: parsed.financial === true,
      settings: parsed.settings === true,
    };
  } catch {
    return null;
  }
}

function parseRole(raw: string | null): StoreRole | null {
  return raw === "admin" || raw === "employee" ? raw : null;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [role, setRole] = useState<StoreRole | null>(null);
  const [permissions, setPermissions] = useState<StorePermissions | null>(null);

  useEffect(() => {
    const storeId = window.localStorage.getItem(STORAGE_KEYS.storeId);
    const accessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);

    if (!storeId || !accessToken) {
      router.push("/login");
      return;
    }

    setRole(parseRole(window.localStorage.getItem(STORAGE_KEYS.role)));
    setPermissions(parsePermissions(window.localStorage.getItem(STORAGE_KEYS.permissions)));
    setChecked(true);
  }, [router]);

  function handleLogout() {
    window.localStorage.removeItem(STORAGE_KEYS.storeId);
    window.localStorage.removeItem(STORAGE_KEYS.accessToken);
    window.localStorage.removeItem(STORAGE_KEYS.role);
    window.localStorage.removeItem(STORAGE_KEYS.permissions);
    router.push("/login");
  }

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav role={role} permissions={permissions} onLogout={handleLogout} />
      {children}
    </div>
  );
}
