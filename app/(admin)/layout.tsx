"use client";

import AdminNav from "@/app/components/admin-nav";
import { AdminSessionProvider, useAdminSession } from "@/app/lib/admin-session-context";

/**
 * app/(admin)/layout.tsx
 *
 * Layout compartilhado do painel admin: renderiza o menu de navegacao
 * (`AdminNav`) acima de qualquer tela do painel (`/pedidos`, `/cardapio`,
 * `/financeiro`, `/configuracoes/*`, `/pedidos/[id]/imprimir`).
 *
 * A leitura de `localStorage`, o parse de `role`/`permissions` e o redirect
 * para `/login` (quando nao ha sessao) agora vivem inteiramente em
 * `AdminSessionProvider` (app/lib/admin-session-context.tsx). Este layout
 * so envolve `children` com o Provider e renderiza `AdminNav` consumindo o
 * Context via `useAdminSession()`.
 */
function AdminNavWithSession() {
  const { role, permissions, logout } = useAdminSession();
  return <AdminNav role={role} permissions={permissions} onLogout={logout} />;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSessionProvider>
      <div className="min-h-screen bg-background">
        <AdminNavWithSession />
        {children}
      </div>
    </AdminSessionProvider>
  );
}
