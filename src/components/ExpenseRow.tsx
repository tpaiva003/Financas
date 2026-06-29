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
  payerName,
}: {
  expense: Expense;
  categoryName: string;
  payerName: string;
}) {
  const isRefund = expense.amountCents < 0;
  const date = new Date(expense.transactionDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
  const emoji = expense.categoryId ? (CATEGORY_EMOJI[expense.categoryId] ?? "•") : "•";

  return (
    <li>
      <Link
        href={`/despesas/${expense.id}/editar`}
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
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {date} · {categoryName} · {payerName}
            {expense.kind === "shared" ? ` · ${splitLabel(expense)}` : ""}
          </p>
        </div>

        <div
          className={`shrink-0 font-mono text-[15px] tnum ${isRefund ? "text-credit" : "text-fg"}`}
        >
          {formatCents(expense.amountCents, expense.currency)}
        </div>
        <span className="ml-1 shrink-0 text-fg-faint opacity-0 transition group-hover:opacity-100" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
