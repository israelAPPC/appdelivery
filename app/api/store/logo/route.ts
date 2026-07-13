import { NextResponse } from "next/server";
import { createAuthedSupabaseClient, getSession, getStorePermissions } from "@/app/lib/auth";

/**
 * POST /api/store/logo
 *
 * Upload do logo da loja para o Supabase Storage (bucket `store-logos`,
 * publico para leitura — o logo aparece no manifest do PWA do storefront,
 * ver supabase/migrations/0005_store_shipping_and_logo_storage.sql).
 *
 * Decisao de arquitetura (Task 2.2): rota SEPARADA de `/api/store` (em vez
 * de aceitar multipart no PATCH), porque upload de arquivo e uma
 * preocupacao distinta de atualizar campos de texto/numero — mantém o PATCH
 * de `/api/store` simples (JSON) e isola a validacao de arquivo (tipo,
 * tamanho) em um unico lugar.
 *
 * Body esperado: `multipart/form-data` com:
 *  - `storeId`: string (uuid da loja)
 *  - `file`: arquivo de imagem (png/jpg/jpeg/webp/svg), max 2MB
 *
 * Regras:
 *  - Exige sessao + permissao `settings` (admin sempre pode) — mesma regra
 *    de PATCH /api/store, pois trocar o logo e parte da configuracao da loja.
 *  - Upload em si e feito com o client AUTENTICADO do usuario (nao
 *    service_role), para que a policy de Storage `store_logos_admin_insert`
 *    (que exige ser admin da loja) continue sendo a ultima linha de defesa.
 *  - Valida tipo de arquivo (apenas imagens) e tamanho maximo no backend,
 *    nunca confiando apenas em validacao client-side.
 *  - Apos o upload, atualiza `stores.logo_url` com a URL publica do arquivo.
 */

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisicao invalido (multipart/form-data esperado)." },
      { status: 400 },
    );
  }

  const storeId = formData.get("storeId");
  if (!isNonEmptyString(storeId)) {
    return NextResponse.json({ error: "Campo 'storeId' e obrigatorio." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' e obrigatorio (arquivo de imagem)." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de arquivo invalido. Envie uma imagem (PNG, JPG, WEBP ou SVG)." },
      { status: 400 },
    );
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande. Tamanho maximo permitido: ${MAX_LOGO_SIZE_BYTES / (1024 * 1024)}MB.` },
      { status: 400 },
    );
  }

  const authedClient = createAuthedSupabaseClient(session.accessToken);

  const access = await getStorePermissions(session.user.id, storeId, authedClient);
  if (!access || !access.permissions.settings) {
    return NextResponse.json(
      { error: "Voce nao tem permissao para alterar o logo desta loja." },
      { status: 403 },
    );
  }

  const extension = extensionForMimeType(file.type);
  // Path comeca com "<store_id>/" — convencao usada pelas policies de
  // Storage (store_logos_admin_insert/update/delete) para restringir a
  // escrita ao admin da propria loja.
  const objectPath = `${storeId}/logo.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await authedClient.storage
    .from("store-logos")
    .upload(objectPath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    const forbidden = /row-level security|permission denied/i.test(uploadError.message);
    return NextResponse.json(
      {
        error: forbidden
          ? "Voce nao tem permissao para enviar o logo desta loja."
          : "Nao foi possivel enviar o logo.",
      },
      { status: forbidden ? 403 : 400 },
    );
  }

  const {
    data: { publicUrl },
  } = authedClient.storage.from("store-logos").getPublicUrl(objectPath);

  const { data: updatedStore, error: updateError } = await authedClient
    .from("stores")
    .update({ logo_url: publicUrl })
    .eq("id", storeId)
    .select()
    .maybeSingle();

  if (updateError || !updatedStore) {
    console.error("[api/store/logo] Falha ao atualizar logo_url", { storeId, updateError });
    return NextResponse.json(
      { error: "Logo enviado, mas nao foi possivel atualizar o registro da loja." },
      { status: 500 },
    );
  }

  return NextResponse.json({ store: updatedStore, logoUrl: publicUrl }, { status: 200 });
}
