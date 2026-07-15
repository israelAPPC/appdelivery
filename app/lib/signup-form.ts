/**
 * app/lib/signup-form.ts
 *
 * Regras puras (sem React/fetch) para o formulario de cadastro de loja
 * (Task 6.1): validacao de campos e geracao de slug a partir do nome da
 * loja. Mantidas fora do componente de UI para poderem ser testadas sem
 * montar componente nenhum (ver tests/lib/signup-form.test.ts).
 */

export type SignupFormInput = {
  storeName: string;
  email: string;
  password: string;
};

export type SignupFormErrors = {
  storeName?: string;
  email?: string;
  password?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignupForm(input: SignupFormInput): SignupFormErrors {
  const errors: SignupFormErrors = {};

  if (!input.storeName || input.storeName.trim().length === 0) {
    errors.storeName = "Informe o nome da loja.";
  }

  if (!input.email || !EMAIL_REGEX.test(input.email.trim())) {
    errors.email = "Informe um e-mail válido.";
  }

  if (!input.password || input.password.length < 6) {
    errors.password = "A senha deve ter ao menos 6 caracteres.";
  }

  return errors;
}

/**
 * Gera um slug kebab-case a partir do nome da loja: remove acentos,
 * caracteres especiais (mantendo apenas letras/numeros/hifen) e colapsa
 * espacos/hifens repetidos.
 */
export function slugifyStoreName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove caracteres especiais
    .trim()
    .replace(/[\s-]+/g, "-") // colapsa espacos/hifens em um unico hifen
    .replace(/^-+|-+$/g, ""); // remove hifens nas pontas
}
