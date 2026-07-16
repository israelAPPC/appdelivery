"use client";

import { useState } from "react";

type Props = {
  productId: string;
  productName: string;
  orderId: string;
};

/**
 * Formulario de avaliacao por estrelas de um produto (Task 5.1), exibido na
 * pagina de acompanhamento do pedido quando `status === 'concluido'`.
 *
 * Nao existe sessao de cliente final — o unico "segredo" conhecido pelo
 * cliente e o `orderId` do proprio pedido, enviado ao backend junto com a
 * nota. Toda a validacao (pedido concluido, produto pertence ao pedido, nota
 * 1-5, sem duplicidade) acontece no backend
 * (`app/api/products/[id]/reviews/route.ts`) — este componente so exibe o
 * resultado (sucesso ou mensagem de erro vinda da API).
 */
export function ProductReviewForm({ productId, productName, orderId }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1 || rating > 5) {
      setError("Selecione de 1 a 5 estrelas.");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, rating, comment: comment.trim() || undefined }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Não foi possível enviar sua avaliação.");
        setStatus("idle");
        return;
      }

      setStatus("done");
    } catch {
      setError("Não foi possível enviar sua avaliação. Tente novamente.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-border bg-surface p-3 text-sm text-success">
        Obrigado por avaliar {productName}!
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <p className="text-sm font-medium text-foreground">{productName}</p>

      <div className="flex gap-1" role="radiogroup" aria-label={`Nota para ${productName}`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
            onClick={() => setRating(star)}
            className={`text-2xl leading-none ${star <= rating ? "text-accent" : "text-muted-foreground"}`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Comentário (opcional)"
        rows={2}
        className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
      />

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        {status === "submitting" ? "Enviando..." : "Enviar avaliação"}
      </button>
    </form>
  );
}
