import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de `app/lib/notifications.ts` (Task 4.3 — push nativo de status do
 * pedido).
 *
 * A lib `web-push` e mockada por completo: nunca envia notificacao de
 * verdade nos testes. O client Supabase (`createSupabaseAdminClient`)
 * tambem e mockado, seguindo o mesmo padrao de tests/api/orders.test.ts.
 *
 * Testes criticos (PLAN.md):
 *  - Mudanca de status dispara exatamente 1 notificacao (nao duplicada) por
 *    subscription do pedido.
 *  - Falha do provedor de push (subscription expirada/erro de rede) e
 *    capturada e NUNCA lanca excecao para quem chamou (nao-bloqueante).
 */

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

const mockFrom = vi.fn();
vi.mock("@/app/lib/supabase-server", () => ({
  createSupabaseAdminClient: () => ({ from: mockFrom }),
}));

import { sendOrderStatusNotification } from "@/app/lib/notifications";

const ORDER_ID = "44444444-4444-4444-4444-444444444444";

function makeSubscriptionsQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const SUBSCRIPTION_1 = { endpoint: "https://push.example.com/1", p256dh: "p256dh-1", auth: "auth-1" };
const SUBSCRIPTION_2 = { endpoint: "https://push.example.com/2", p256dh: "p256dh-2", auth: "auth-2" };

describe("sendOrderStatusNotification", () => {
  beforeEach(() => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "vapid-public-key-de-teste");
    vi.stubEnv("VAPID_PRIVATE_KEY", "vapid-private-key-de-teste");
    mockFrom.mockReset();
    mockSendNotification.mockReset();
    mockSetVapidDetails.mockReset();
    mockSendNotification.mockResolvedValue(undefined);
  });

  it("dispara exatamente 1 notificacao por subscription vinculada ao pedido (sem duplicar)", async () => {
    mockFrom.mockReturnValue(
      makeSubscriptionsQueryBuilder({ data: [SUBSCRIPTION_1, SUBSCRIPTION_2], error: null }),
    );

    await sendOrderStatusNotification(ORDER_ID, "preparo");

    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const [subscriptionArg1, payloadArg1] = mockSendNotification.mock.calls[0];
    expect(subscriptionArg1).toEqual({
      endpoint: SUBSCRIPTION_1.endpoint,
      keys: { p256dh: SUBSCRIPTION_1.p256dh, auth: SUBSCRIPTION_1.auth },
    });
    expect(JSON.parse(payloadArg1 as string)).toMatchObject({ body: expect.stringContaining("preparo") });
  });

  it("nao envia nenhuma notificacao quando o pedido nao tem subscription cadastrada", async () => {
    mockFrom.mockReturnValue(makeSubscriptionsQueryBuilder({ data: [], error: null }));

    await sendOrderStatusNotification(ORDER_ID, "entrega");

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("falha do provedor de push (subscription expirada) e capturada e nao lanca excecao", async () => {
    mockFrom.mockReturnValue(
      makeSubscriptionsQueryBuilder({ data: [SUBSCRIPTION_1], error: null }),
    );
    mockSendNotification.mockRejectedValue(new Error("subscription expirada (410 Gone)"));

    await expect(sendOrderStatusNotification(ORDER_ID, "concluido")).resolves.toBeUndefined();
  });

  it("erro ao buscar subscriptions no banco tambem e capturado e nao lanca excecao", async () => {
    mockFrom.mockReturnValue(
      makeSubscriptionsQueryBuilder({ data: null, error: { message: "boom" } }),
    );

    await expect(sendOrderStatusNotification(ORDER_ID, "preparo")).resolves.toBeUndefined();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
