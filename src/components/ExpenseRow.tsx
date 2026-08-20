import Link from "next/link";
import { formatCents, type Expense } from "@/lib/domain";

function splitLabel(e: Expense): string {
  switch (e.split.type) {
    case "EQUAL":
      return "50/50";
    case "PERCENT": {
      const vals = Object.values(e.split.weights ?? {});
      return vals.length ? vals.map((v) => `${v}%`).join("/") : "%";
    }
    case "SHARES":
      return "quotas";
    case "FIXED":
      return "fixo";
    default:
      return "";
  }
}

/**
 * Ícones das categorias por omissão. Só serve de rede de segurança: o ícone a
 * usar é o que está guardado na categoria, porque as categorias criadas em cada
 * ambiente (ex.: "Casamento") têm o seu e não cabem numa lista fixa.
 */
const CATEGORY_EMOJI: Record<string, string> = {
  supermercado: "🛒",
  restauracao: "🍽️",
  combustivel: "⛽",
  casa: "🏠",
  saude: "💊",
  lazer: "🎬",
  subscricoes: "📺",
  transportes: "🚆",
  outros: "📦",
};

export function ExpenseRow({
  expense,
  categoryName,
  categoryIcon,
  payerName,
}: {
  expense: Expense;
  categoryName: string;
  /** Ícone guardado na categoria. Ganha à lista fixa. */
  categoryIcon?: string | null;
  payerName: string;
}) {
  const isRefund = expense.amountCents < 0;
  const date = new Date(expense.transactionDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
  const emoji =
    categoryIcon || (expense.categoryId ? (CATEGORY_EMOJI[expense.categoryId] ?? "•") : "•");

  return (
    <li>
      <Link
        href={`/despesas/${expense.id}/editar`}
        // Sem prefetch: uma lista de 300 despesas disparava 300 renders de
        // fundo do formulário de edição.
        prefetch={false}
        className="row group hover:border-hair"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-hair bg-panel2/50 text-base">
          {emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-medium text-fg">{expense.description}</p>
            {expense.kind === "personal" ? <span className="chip shrink-0">Pessoal</span> : null}
            {expense.status === "pending" ? (
              <span className="chip shrink-0 border-debt/30 text-debt">Pendente</span>
            ) : null}
            {expense.approvalStatus === "pending" ? (
              <span className="chip shrink-0 border-debt/30 text-debt">Por aprovar</span>
            ) : null}
            {expense.approvalStatus === "rejected" ? (
              <span className="chip shrink-0 border-hair text-fg-faint">Rejeitada</span>
            ) : null}
            {expense.receiptPath ? (
              <span className="shrink-0 text-fg-faint" title="Tem recibo" aria-label="Tem recibo">📎</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {date} · {categoryName} · {payerName}
            {expense.kind === "shared" ? ` · ${splitLabel(expense)}` : ""}
          </p>
        </div>

        <div
          className={`shrink-0 font-mono text-[15px] tnum ${isRefund ? "text-credit" : "text-fg"}`}
        >
          <span className="dinheiro">{formatCents(expense.amountCents, expense.currency)}</span>
        </div>
        <span className="ml-1 shrink-0 text-fg-faint opacity-0 transition group-hover:opacity-100" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
