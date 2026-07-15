import { describe, expect, it } from "vitest";
import { slugifyStoreName, validateSignupForm } from "@/app/lib/signup-form";

describe("validateSignupForm", () => {
  it("rejeita e-mail invalido", () => {
    const errors = validateSignupForm({
      storeName: "Lanchonete do Ze",
      email: "nao-e-um-email",
      password: "123456",
    });
    expect(errors.email).toBeDefined();
  });

  it("rejeita senha curta (menos de 6 caracteres)", () => {
    const errors = validateSignupForm({
      storeName: "Lanchonete do Ze",
      email: "dono@lanchonete.com",
      password: "12345",
    });
    expect(errors.password).toBeDefined();
  });

  it("rejeita nome da loja vazio", () => {
    const errors = validateSignupForm({
      storeName: "   ",
      email: "dono@lanchonete.com",
      password: "123456",
    });
    expect(errors.storeName).toBeDefined();
  });

  it("aceita formulario valido (sem erros)", () => {
    const errors = validateSignupForm({
      storeName: "Lanchonete do Ze",
      email: "dono@lanchonete.com",
      password: "123456",
    });
    expect(errors).toEqual({});
  });
});

describe("slugifyStoreName", () => {
  it("gera slug kebab-case, minusculo, sem acentos", () => {
    expect(slugifyStoreName("Lanchonete do Zé!")).toBe("lanchonete-do-ze");
  });

  it("remove acentos diversos", () => {
    expect(slugifyStoreName("Açaí & Cia São João")).toBe("acai-cia-sao-joao");
  });

  it("colapsa espacos multiplos e hifens duplicados", () => {
    expect(slugifyStoreName("Bar   do   Zé   ")).toBe("bar-do-ze");
  });

  it("remove caracteres especiais mantendo apenas letras, numeros e hifens", () => {
    expect(slugifyStoreName("Pizza's House #1")).toBe("pizzas-house-1");
  });
});
