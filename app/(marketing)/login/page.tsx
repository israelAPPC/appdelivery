"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * app/(marketing)/login/page.tsx
 *
 * Tela minima de login (Task 6.1). Faz POST em `/api/auth/login`
 * (ja existente) e grava a sessao no localStorage no mesmo padrao do
 * restante do painel admin. `POST /api/auth/login` resolve `store.id` a
 * partir do vinculo do usuario em `store_users` e o retorna quando existe;
 * esta tela persiste `app_delivery_store_id` da mesma forma que o fluxo de
 * cadastro (`app/(marketing)/cadastro/page.tsx`). Se o usuario nao tiver
 * loja vinculada, a resposta nao traz `store` e nao gravamos nada em
 * `app_delivery_store_id` — o painel (`/pedidos`) trata a ausencia desse
 * valor.
 */

type LoginResponse = {
  session?: { access_token: string };
  store?: {
    id: string;
    role: "admin" | "employee";
    permissions: { orders: boolean; catalog: boolean; financial: boolean; settings: boolean };
  };
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json()) as LoginResponse;

      if (!response.ok || !body.session) {
        setError(body.error ?? "Não foi possível entrar. Verifique seus dados.");
        return;
      }

      window.localStorage.setItem("app_delivery_access_token", body.session.access_token);
      if (body.store?.id) {
        window.localStorage.setItem("app_delivery_store_id", body.store.id);
        window.localStorage.setItem("app_delivery_role", body.store.role);
        window.localStorage.setItem("app_delivery_permissions", JSON.stringify(body.store.permissions));
      }
      router.push("/pedidos");
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold text-foreground">Entrar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Acesse o painel da sua loja.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda não tem uma loja?{" "}
          <Link href="/cadastro" className="font-medium text-foreground hover:opacity-80">
            Criar minha loja
          </Link>
        </p>
      </div>
    </main>
  );
}
