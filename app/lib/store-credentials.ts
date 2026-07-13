import "server-only";
import { createSupabaseAdminClient } from "./supabase-server";

/**
 * Central de credenciais de integracao da loja (Task 2.4).
 *
 * O valor em texto plano de cada credencial (ex.: access token do Mercado
 * Pago) NUNCA e persistido em uma coluna normal de `store_credentials` —
 * fica armazenado no Supabase Vault (extensao pgsodium nativa do Postgres,
 * ver supabase/migrations/0006_store_credentials_vault.sql). A tabela
 * `store_credentials` guarda apenas a referencia (`secret_id`).
 *
 * Este modulo concentra toda leitura/escrita de segredos via Vault; nenhuma
 * outra parte do app deve usar `vault.decrypted_secrets` diretamente.
 *
 * Todas as funcoes aqui usam o client `service_role` (necessario porque as
 * funcoes/tabelas do Vault nao sao acessiveis via RLS comum), por isso este
 * modulo e restrito a codigo server-side (`server-only`) e a checagem de
 * permissao (`getStorePermissions`, permissao `settings`) deve SEMPRE ser
 * feita pelo chamador (route handler) antes de invocar qualquer funcao daqui.
 */

export type CredentialProvider = "mercado_pago" | "whatsapp";

const VALID_PROVIDERS: readonly CredentialProvider[] = ["mercado_pago", "whatsapp"];

export function isValidProvider(value: unknown): value is CredentialProvider {
  return typeof value === "string" && (VALID_PROVIDERS as readonly string[]).includes(value);
}

/** Ultimos 4 caracteres do valor, para exibicao ("configurada", terminando em ****1234"). */
function last4(value: string): string {
  return value.slice(-4);
}

/**
 * Salva (cria ou atualiza) a credencial de um provider para uma loja.
 * Cria um novo segredo no Vault a cada chamada e atualiza o `secret_id`
 * referenciado por `store_credentials` (nunca reaproveita/edita o valor
 * de um secret ja existente por fora do Vault).
 */
export async function upsertStoreCredential(
  storeId: string,
  provider: CredentialProvider,
  plainValue: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: secretId, error: secretError } = await admin.rpc("create_vault_secret_for_store", {
    p_secret_value: plainValue,
    p_secret_name: `store_credential:${storeId}:${provider}:${Date.now()}`,
  });

  if (secretError || !secretId) {
    throw new Error(secretError?.message ?? "Nao foi possivel criar o segredo no Vault.");
  }

  const { error: upsertError } = await admin
    .from("store_credentials")
    .upsert(
      { store_id: storeId, provider, secret_id: secretId as string },
      { onConflict: "store_id,provider" },
    );

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

/**
 * Retorna o status publico de uma credencial: se esta configurada e, se sim,
 * os ultimos 4 caracteres do valor (para exibicao na UI). NUNCA retorna o
 * valor completo em texto plano.
 */
export async function getStoreCredentialStatus(
  storeId: string,
  provider: CredentialProvider,
): Promise<{ configured: boolean; last4: string | null }> {
  const admin = createSupabaseAdminClient();

  const { data: credential, error } = await admin
    .from("store_credentials")
    .select("secret_id")
    .eq("store_id", storeId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !credential) {
    return { configured: false, last4: null };
  }

  const { data: decrypted, error: decryptError } = await admin.rpc("get_decrypted_vault_secret", {
    p_secret_id: credential.secret_id,
  });

  if (decryptError || !decrypted) {
    // A referencia existe mas o valor nao pode ser lido — trata como nao
    // configurado, nunca lanca o valor bruto/erro para o chamador da rota GET.
    return { configured: false, last4: null };
  }

  return { configured: true, last4: last4(decrypted as string) };
}

/**
 * Le o valor em texto plano da credencial de um provider para uma loja.
 * Uso restrito a fluxos internos que precisam efetivamente do valor (ex.:
 * Task 3.2, ao gerar a preferencia de pagamento do Mercado Pago) — NUNCA
 * expor o retorno desta funcao em uma resposta HTTP.
 */
export async function getDecryptedStoreCredential(
  storeId: string,
  provider: CredentialProvider,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: credential, error } = await admin
    .from("store_credentials")
    .select("secret_id")
    .eq("store_id", storeId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !credential) return null;

  const { data: decrypted, error: decryptError } = await admin.rpc("get_decrypted_vault_secret", {
    p_secret_id: credential.secret_id,
  });

  if (decryptError || !decrypted) return null;

  return decrypted as string;
}

/**
 * Helper auxiliar consumido pela Task 3.2 (checkout): indica se a loja tem
 * o provider configurado, para decidir se a opcao de pagamento "pagar agora"
 * (Mercado Pago) pode ser oferecida. Loja sem `mercado_pago` configurado
 * nunca deve habilitar essa opcao.
 */
export async function hasProviderConfigured(
  storeId: string,
  provider: CredentialProvider,
): Promise<boolean> {
  const status = await getStoreCredentialStatus(storeId, provider);
  return status.configured;
}
