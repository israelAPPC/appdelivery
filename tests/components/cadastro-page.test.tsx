// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import CadastroPage from "@/app/(marketing)/cadastro/page";

describe("CadastroPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exibe erros de validacao sem chamar a API quando o formulario e invalido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<CadastroPage />);

    fireEvent.click(screen.getByRole("button", { name: /criar minha loja/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("em sucesso, grava sessao no localStorage e redireciona para /pedidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        store: { id: "store-1" },
        session: { access_token: "token-abc" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CadastroPage />);

    fireEvent.change(screen.getByLabelText(/nome da loja/i), { target: { value: "Lanchonete do Zé" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "dono@lanchonete.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /criar minha loja/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/pedidos"));

    expect(window.localStorage.getItem("app_delivery_store_id")).toBe("store-1");
    expect(window.localStorage.getItem("app_delivery_access_token")).toBe("token-abc");

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.store.slug).toBe("lanchonete-do-ze");
  });

  it("exibe erro retornado pela API em caso de falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Já existe uma conta com este e-mail." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CadastroPage />);

    fireEvent.change(screen.getByLabelText(/nome da loja/i), { target: { value: "Lanchonete do Zé" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "dono@lanchonete.com" } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /criar minha loja/i }));

    expect(await screen.findByText(/já existe uma conta com este e-mail/i)).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
