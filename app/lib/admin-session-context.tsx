"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { StorePermissions, StoreRole } from "@/app/lib/auth";

/**
 * app/lib/admin-session-context.tsx
 *
 * Context/hook unico de sessao do painel admin. Substitui o padrao
 * provisorio duplicado em cada pagina (`useEffect` proprio lendo
 * `storeId`/`accessToken` de `localStorage`) por uma unica leitura,
 * centralizada aqui, exposta via `useAdminSession()`.
 *
 * A logica e a MESMA que ja existia em `app/(admin)/layout.tsx`:
 *  - le os 5 itens de `localStorage` (`app_delivery_store_id`,
 *    `app_delivery_access_token`, `app_delivery_refresh_token`,
 *    `app_delivery_role`, `app_delivery_permissions`);
 *  - parseia `role`/`permissions`;
 *  - redireciona pra `/login` se `storeId`/`accessToken` estiverem ausentes.
 *
 * `authenticatedFetch` (app/lib/authenticated-fetch.ts) continua lendo o
 * `accessToken` diretamente do `localStorage` a cada chamada (inclusive apos
 * refresh) — isso e intencional e nao muda aqui. O que este Context resolve
 * e a duplicacao de `storeId`/`role`/`permissions` em cada pagina.
 */

const STORAGE_KEYS = {
  storeId: "app_delivery_store_id",
  accessToken: "app_delivery_access_token",
  refreshToken: "app_delivery_refresh_token",
  role: "app_delivery_role",
  permissions: "app_delivery_permissions",
} as const;

export type AdminSession = {
  storeId: string | null;
  accessToken: string | null;
  role: StoreRole | null;
  permissions: StorePermissions | null;
  logout: () => void;
};

const AdminSessionContext = createContext<AdminSession | undefined>(undefined);

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

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role, setRole] = useState<StoreRole | null>(null);
  const [permissions, setPermissions] = useState<StorePermissions | null>(null);

  useEffect(() => {
    const currentStoreId = window.localStorage.getItem(STORAGE_KEYS.storeId);
    const currentAccessToken = window.localStorage.getItem(STORAGE_KEYS.accessToken);

    if (!currentStoreId || !currentAccessToken) {
      router.push("/login");
      return;
    }

    setStoreId(currentStoreId);
    setAccessToken(currentAccessToken);
    setRole(parseRole(window.localStorage.getItem(STORAGE_KEYS.role)));
    setPermissions(parsePermissions(window.localStorage.getItem(STORAGE_KEYS.permissions)));
    setChecked(true);
  }, [router]);

  function logout() {
    window.localStorage.removeItem(STORAGE_KEYS.storeId);
    window.localStorage.removeItem(STORAGE_KEYS.accessToken);
    window.localStorage.removeItem(STORAGE_KEYS.refreshToken);
    window.localStorage.removeItem(STORAGE_KEYS.role);
    window.localStorage.removeItem(STORAGE_KEYS.permissions);
    router.push("/login");
  }

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <AdminSessionContext.Provider value={{ storeId, accessToken, role, permissions, logout }}>
      {children}
    </AdminSessionContext.Provider>
  );
}

/**
 * Hook para consumir a sessao do painel admin. Lanca erro claro se usado
 * fora do `AdminSessionProvider` (falha cedo/alto, em vez de retornar
 * `undefined` silenciosamente e propagar bugs sutis pras paginas).
 */
export function useAdminSession(): AdminSession {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error("useAdminSession precisa ser usado dentro de um <AdminSessionProvider>.");
  }
  return context;
}
