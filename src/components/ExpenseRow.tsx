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

  return (
    <li className="card flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-slate-900">{expense.description}</p>
          {expense.kind === "personal" ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
              Pessoal
            </span>
          ) : null}
          {expense.status === "pending" ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
              Pendente
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {date} · {categoryName} · pagou {payerName}
          {expense.kind === "shared" ? ` · ${splitLabel(expense)}` : ""}
        </p>
      </div>
      <div
        className={`shrink-0 text-right font-semibold ${
          isRefund ? "text-green-600" : "text-slate-900"
        }`}
      >
        {formatCents(expense.amountCents, expense.currency)}
      </div>
    </li>
  );
}
