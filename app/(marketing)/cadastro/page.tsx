"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { slugifyStoreName, validateSignupForm, type SignupFormErrors } from "@/app/lib/signup-form";

/**
 * app/(marketing)/cadastro/page.tsx
 *
 * Formulario de cadastro de loja (Task 6.1). Reaproveita o endpoint
 * `POST /api/auth/signup` ja existente (nao duplica logica de criacao de
 * loja/usuario). Em sucesso, grava sessao no localStorage no mesmo padrao
 * usado pelo restante do painel admin (`app_delivery_store_id` /
 * `app_delivery_access_token`) e redireciona para `/pedidos`.
 */

type SignupResponse = {
  store?: {
    id: string;
    role: "admin" | "employee";
    permissions: { orders: boolean; catalog: boolean; financial: boolean; settings: boolean };
  };
  session?: { access_token: string };
  error?: string;
};

export default function CadastroPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignupFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateSignupForm({ storeName, email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          store: {
            name: storeName,
            slug: slugifyStoreName(storeName),
            whatsapp_number: whatsappNumber.trim() || undefined,
          },
        }),
      });

      const body = (await response.json()) as SignupResponse;

      if (!response.ok || !body.store || !body.session) {
        setSubmitError(body.error ?? "Não foi possível criar a loja. Tente novamente.");
        return;
      }

      window.localStorage.setItem("app_delivery_store_id", body.store.id);
      window.localStorage.setItem("app_delivery_access_token", body.session.access_token);
      window.localStorage.setItem("app_delivery_role", body.store.role);
      window.localStorage.setItem("app_delivery_permissions", JSON.stringify(body.store.permissions));
      router.push("/pedidos");
    } catch {
      setSubmitError("Não foi possível criar a loja. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold text-foreground">Criar minha loja</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cadastre sua loja e comece a receber pedidos com mensalidade fixa, sem taxa por venda.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <div>
            <label htmlFor="storeName" className="block text-sm font-medium text-foreground">
              Nome da loja
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
            {fieldErrors.storeName && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {fieldErrors.storeName}
              </p>
            )}
          </div>

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
            {fieldErrors.email && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {fieldErrors.email}
              </p>
            )}
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
            {fieldErrors.password && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="whatsappNumber" className="block text-sm font-medium text-foreground">
              WhatsApp da loja (opcional)
            </label>
            <input
              id="whatsappNumber"
              type="tel"
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Criando loja..." : "Criar minha loja grátis"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-medium text-foreground hover:opacity-80">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
