"use client";

import { useEffect, useState } from "react";

/**
 * app/(admin)/configuracoes/integracoes/page.tsx
 *
 * UI simples para o lojista configurar a credencial do Mercado Pago
 * (Task 2.4). Mostra apenas "configurada" / "nao configurada" + ultimos 4
 * caracteres (quando configurada) — o valor completo da chave NUNCA e
 * devolvido pelo backend, entao esta tela nunca pode exibi-lo.
 *
 * Nota de implementacao: como o contexto/hook de sessao autenticada
 * compartilhado do painel admin ainda nao existe (dependente de infra de
 * frontend futura), esta pagina le `storeId` e `accessToken` de
 * `localStorage` (chaves `app_delivery_store_id` / `app_delivery_access_token`),
 * como placeholder ate a Task de auth/layout do painel admin definir o
 * padrao definitivo de sessao no client. A logica de negocio (chamadas a
 * `/api/store/credentials`) e o que importa e ja segue o contrato final.
 */

type CredentialStatus = {
  configured: boolean;
  last4: string | null;
};

const PROVIDER = "mercado_pago" as const;

export default function IntegracoesPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStoreId(window.localStorage.getItem("app_delivery_store_id"));
    setAccessToken(window.localStorage.getItem("app_delivery_access_token"));
  }, []);

  useEffect(() => {
    if (!storeId || !accessToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/store/credentials?storeId=${encodeURIComponent(storeId)}&provider=${PROVIDER}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Nao foi possivel carregar o status da integracao.");
        }
        return (await response.json()) as CredentialStatus;
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, accessToken]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !accessToken) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/store/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ storeId, provider: PROVIDER, value }),
      });

      const body = (await response.json()) as CredentialStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Nao foi possivel salvar a credencial.");
      }

      setStatus({ configured: body.configured, last4: body.last4 });
      setValue("");
      setMessage("Credencial salva com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sessão da loja não encontrada. Faça login novamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Integrações</h1>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-medium text-foreground sm:text-lg">Mercado Pago</h2>

          <div className="mt-3">
            {status?.configured ? (
              <p className="inline-flex items-center gap-2 text-sm text-foreground">
                Status:
                <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-medium text-background">
                  configurada
                </span>
                <span className="text-muted-foreground">(terminando em ****{status.last4})</span>
              </p>
            ) : (
              <p className="inline-flex items-center gap-2 text-sm text-foreground">
                Status:
                <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-medium text-background">
                  não configurada
                </span>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="flex-1">
              <label
                htmlFor="mercado-pago-key"
                className="block text-sm font-medium text-foreground"
              >
                Access Token do Mercado Pago
              </label>
              <input
                id="mercado-pago-key"
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="APP_USR-..."
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </form>

          {message && (
            <p role="status" className="mt-3 text-sm text-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
