"use client";

import { useEffect, useState } from "react";

/**
 * app/(admin)/configuracoes/loja/page.tsx
 *
 * Tela do lojista para editar os dados cadastrais da propria loja
 * (endereco, contato, horario de funcionamento, configuracao de frete e
 * logo). Consome `GET/PATCH /api/store` e `POST /api/store/logo`
 * (contratos ja implementados e testados em `app/api/store/route.ts` e
 * `app/api/store/logo/route.ts`).
 *
 * Nota de implementacao: como o contexto/hook de sessao autenticada
 * compartilhado do painel admin ainda nao existe, esta pagina le `storeId`
 * e `accessToken` de `localStorage` (chaves `app_delivery_store_id` /
 * `app_delivery_access_token`), mesmo padrao provisorio usado em
 * `app/(admin)/configuracoes/integracoes/page.tsx`.
 *
 * `opening_hours` e um JSON livre no schema (`stores.opening_hours jsonb`,
 * "formato JSON livre, refinado em tasks futuras") — em vez de um editor
 * dedicado por dia da semana (que exigiria decidir um formato definitivo
 * que o backend ainda nao fixa), usamos um textarea com o JSON cru. Formato
 * sugerido documentado no placeholder/comentario abaixo.
 */

type Store = {
  id: string;
  name: string;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip_code: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  opening_hours: unknown;
  free_radius_km: number | null;
  price_per_km: number | null;
  logo_url: string | null;
};

type FormState = {
  name: string;
  address_street: string;
  address_number: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip_code: string;
  phone: string;
  whatsapp_number: string;
  opening_hours_json: string;
  free_radius_km: string;
  price_per_km: string;
};

function storeToFormState(store: Store): FormState {
  return {
    name: store.name ?? "",
    address_street: store.address_street ?? "",
    address_number: store.address_number ?? "",
    address_neighborhood: store.address_neighborhood ?? "",
    address_city: store.address_city ?? "",
    address_state: store.address_state ?? "",
    address_zip_code: store.address_zip_code ?? "",
    phone: store.phone ?? "",
    whatsapp_number: store.whatsapp_number ?? "",
    opening_hours_json: JSON.stringify(store.opening_hours ?? {}, null, 2),
    free_radius_km: store.free_radius_km === null || store.free_radius_km === undefined ? "" : String(store.free_radius_km),
    price_per_km: store.price_per_km === null || store.price_per_km === undefined ? "" : String(store.price_per_km),
  };
}

/**
 * Validacoes de UX espelhando as regras reais do backend (CLAUDE.md / skill
 * calculo-frete) — o backend valida de novo de qualquer forma, isto e
 * apenas feedback mais rapido para o usuario.
 */
function validateForm(form: FormState): string | null {
  if (!form.name.trim()) {
    return "Nome da loja nao pode ser vazio.";
  }

  const hasShippingConfigured = form.free_radius_km.trim() !== "" || form.price_per_km.trim() !== "";
  if (hasShippingConfigured && (!form.address_street.trim() || !form.address_city.trim())) {
    return "Endereco (rua e cidade) e obrigatorio quando o frete esta configurado.";
  }

  if (form.free_radius_km.trim() !== "") {
    const value = Number(form.free_radius_km);
    if (!Number.isFinite(value) || value < 0) {
      return "Raio gratis (km) deve ser um numero maior ou igual a zero.";
    }
  }

  if (form.price_per_km.trim() !== "") {
    const value = Number(form.price_per_km);
    if (!Number.isFinite(value) || value < 0) {
      return "Preco por km deve ser um numero maior ou igual a zero.";
    }
  }

  if (form.opening_hours_json.trim() !== "") {
    try {
      JSON.parse(form.opening_hours_json);
    } catch {
      return "Horario de funcionamento deve ser um JSON valido.";
    }
  }

  return null;
}

export default function ConfiguracoesLojaPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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

    fetch(`/api/store?storeId=${encodeURIComponent(storeId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const body = (await response.json()) as { store?: Store; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Nao foi possivel carregar os dados da loja.");
        }
        return body.store as Store;
      })
      .then((data) => {
        if (cancelled) return;
        setStore(data);
        setForm(storeToFormState(data));
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

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !accessToken || !form) return;

    setMessage(null);
    setError(null);

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          storeId,
          name: form.name,
          address_street: form.address_street,
          address_number: form.address_number,
          address_neighborhood: form.address_neighborhood,
          address_city: form.address_city,
          address_state: form.address_state,
          address_zip_code: form.address_zip_code,
          phone: form.phone,
          whatsapp_number: form.whatsapp_number,
          opening_hours: form.opening_hours_json.trim() === "" ? {} : JSON.parse(form.opening_hours_json),
          free_radius_km: form.free_radius_km.trim() === "" ? null : Number(form.free_radius_km),
          price_per_km: form.price_per_km.trim() === "" ? null : Number(form.price_per_km),
        }),
      });

      const body = (await response.json()) as { store?: Store; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Nao foi possivel salvar as alteracoes.");
      }

      setStore(body.store as Store);
      setForm(storeToFormState(body.store as Store));
      setMessage("Dados da loja atualizados com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !storeId || !accessToken) return;

    setMessage(null);
    setError(null);
    setUploadingLogo(true);

    try {
      const formData = new FormData();
      formData.append("storeId", storeId);
      formData.append("file", file);

      const response = await fetch("/api/store/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const body = (await response.json()) as { store?: Store; logoUrl?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Nao foi possivel enviar o logo.");
      }

      setStore(body.store as Store);
      setMessage("Logo atualizado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (!storeId || !accessToken) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-semibold text-foreground">Configurações da loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sessão da loja não encontrada. Faça login novamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Configurações da loja</h1>

        {loading && <p className="text-sm text-muted-foreground">Carregando dados da loja...</p>}

        {message && (
          <p role="status" className="text-sm text-success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {form && (
          <>
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
              <h2 className="text-base font-medium text-foreground sm:text-lg">Logo da loja</h2>

              <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {store?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.logo_url}
                    alt="Logo da loja"
                    className="h-16 w-16 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-background text-xs text-muted-foreground">
                    Sem logo
                  </div>
                )}

                <div>
                  <label htmlFor="logo-input" className="block text-sm font-medium text-foreground">
                    Enviar novo logo
                  </label>
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="mt-1 text-sm text-foreground"
                  />
                  {uploadingLogo && <p className="mt-1 text-xs text-muted-foreground">Enviando...</p>}
                </div>
              </div>
            </section>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-medium text-foreground sm:text-lg">Dados gerais</h2>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="name" className="block text-sm font-medium text-foreground">
                      Nome da loja
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                      Telefone
                    </label>
                    <input
                      id="phone"
                      type="text"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="whatsapp_number" className="block text-sm font-medium text-foreground">
                      WhatsApp
                    </label>
                    <input
                      id="whatsapp_number"
                      type="text"
                      value={form.whatsapp_number}
                      onChange={(event) => updateField("whatsapp_number", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-medium text-foreground sm:text-lg">Endereço</h2>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="address_street" className="block text-sm font-medium text-foreground">
                      Rua
                    </label>
                    <input
                      id="address_street"
                      type="text"
                      value={form.address_street}
                      onChange={(event) => updateField("address_street", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="address_number" className="block text-sm font-medium text-foreground">
                      Número
                    </label>
                    <input
                      id="address_number"
                      type="text"
                      value={form.address_number}
                      onChange={(event) => updateField("address_number", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="address_neighborhood" className="block text-sm font-medium text-foreground">
                      Bairro
                    </label>
                    <input
                      id="address_neighborhood"
                      type="text"
                      value={form.address_neighborhood}
                      onChange={(event) => updateField("address_neighborhood", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="address_city" className="block text-sm font-medium text-foreground">
                      Cidade
                    </label>
                    <input
                      id="address_city"
                      type="text"
                      value={form.address_city}
                      onChange={(event) => updateField("address_city", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="address_state" className="block text-sm font-medium text-foreground">
                      Estado
                    </label>
                    <input
                      id="address_state"
                      type="text"
                      value={form.address_state}
                      onChange={(event) => updateField("address_state", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="address_zip_code" className="block text-sm font-medium text-foreground">
                      CEP
                    </label>
                    <input
                      id="address_zip_code"
                      type="text"
                      value={form.address_zip_code}
                      onChange={(event) => updateField("address_zip_code", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-medium text-foreground sm:text-lg">Horário de funcionamento</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Formato JSON livre, um bloco por dia da semana. Ex.:{" "}
                  {"{ \"segunda\": { \"abre\": \"08:00\", \"fecha\": \"18:00\" } }"}
                </p>
                <textarea
                  id="opening_hours_json"
                  aria-label="Horário de funcionamento (JSON)"
                  value={form.opening_hours_json}
                  onChange={(event) => updateField("opening_hours_json", event.target.value)}
                  rows={8}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-medium text-foreground sm:text-lg">Configuração de frete</h2>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="free_radius_km" className="block text-sm font-medium text-foreground">
                      Raio grátis (km)
                    </label>
                    <input
                      id="free_radius_km"
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.free_radius_km}
                      onChange={(event) => updateField("free_radius_km", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div>
                    <label htmlFor="price_per_km" className="block text-sm font-medium text-foreground">
                      Preço por km
                    </label>
                    <input
                      id="price_per_km"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.price_per_km}
                      onChange={(event) => updateField("price_per_km", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                </div>
              </section>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
