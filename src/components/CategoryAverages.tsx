import { saveSpendingGoalAction } from "@/app/(app)/actions";
import { formatCents, type AverageRow, type AveragesResult, type GoalState } from "@/lib/domain";

const GOAL_STYLE: Record<GoalState, string> = {
  over: "text-debt",
  near: "text-fg",
  under: "text-credit",
  none: "text-fg-faint",
};

const GOAL_BAR: Record<GoalState, string> = {
  over: "bg-debt",
  near: "bg-fg",
  under: "bg-credit",
  none: "bg-fg-faint",
};

/** Valor em euros para pré-preencher o campo da meta (formato europeu). */
function euros(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Médias mensais por categoria e metas (REQ-REL).
 *
 * Responde a "quanto costumo gastar por mês nisto, e como está este mês?" e
 * deixa ajustar o tecto mensal de cada categoria ali mesmo, sem sair do
 * relatório.
 */
export function CategoryAverages({
  averages,
  monthLabel,
  editable,
}: {
  averages: AveragesResult;
  monthLabel: string;
  editable: boolean;
}) {
  const rows = averages.rows.filter(
    (r) => r.currentCents !== 0 || r.averageCents !== 0 || r.goalCents !== null,
  );

  if (!averages.currentMonth || (rows.length === 0 && !averages.total)) {
    return (
      <p className="card p-6 text-center text-sm text-fg-muted">
        Ainda não há meses suficientes para calcular médias.
      </p>
    );
  }

  return (
    <div className="card divide-y divide-hair2 p-0">
      <div className="p-5">
        <p className="text-xs text-fg-muted">
          {averages.monthsCounted > 0 ? (
            <>
              Média dos {averages.monthsCounted}{" "}
              {averages.monthsCounted === 1 ? "mês anterior" : "meses anteriores"} — o mês em
              análise ({monthLabel}) não entra na própria média.
            </>
          ) : (
            <>Ainda não há meses anteriores para comparar: mostra-se só {monthLabel}.</>
          )}
        </p>
      </div>

      {averages.total ? (
        <AverageRowItem row={averages.total} editable={editable} emphasis />
      ) : null}

      {rows.map((r) => (
        <AverageRowItem key={r.key} row={r} editable={editable} />
      ))}
    </div>
  );
}

function AverageRowItem({
  row,
  editable,
  emphasis = false,
}: {
  row: AverageRow;
  editable: boolean;
  emphasis?: boolean;
}) {
  const barPct = row.goalPct === null ? 0 : Math.min(100, Math.max(0, row.goalPct));

  return (
    <div className={`p-5 ${emphasis ? "bg-panel2/40" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
          {!emphasis ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
          ) : null}
          <span className="truncate">{row.label}</span>
        </p>
        <p className="flex shrink-0 items-baseline gap-3 font-mono text-sm tnum">
          <span className="text-fg">{formatCents(row.currentCents)}</span>
          <span className="text-fg-faint">
            média <span className="text-fg-muted">{formatCents(row.averageCents)}</span>
          </span>
          <AverageDelta row={row} />
        </p>
      </div>

      {/* Meta: barra de progresso + edição inline. */}
      {row.goalCents !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
            <div className={`h-full rounded-full ${GOAL_BAR[row.goalState]}`} style={{ width: `${barPct}%` }} />
          </div>
          <p className={`mt-1 text-xs ${GOAL_STYLE[row.goalState]}`}>
            {row.goalState === "over"
              ? `Passou a meta de ${formatCents(row.goalCents)} em ${formatCents(-row.goalRemainingCents!)}.`
              : `${Math.round(row.goalPct ?? 0)}% da meta de ${formatCents(row.goalCents)} · faltam ${formatCents(row.goalRemainingCents ?? 0)}.`}
          </p>
        </div>
      ) : null}

      {editable ? (
        <form action={saveSpendingGoalAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="categoryId" value={row.key} />
          <label className="sr-only" htmlFor={`goal-${row.key}`}>
            Meta mensal de {row.label}
          </label>
          <div className="relative">
            <input
              id={`goal-${row.key}`}
              name="amount"
              inputMode="decimal"
              defaultValue={euros(row.goalCents)}
              placeholder="sem meta"
              className="input h-9 w-32 py-1 pr-7 text-xs"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-faint">
              €
            </span>
          </div>
          <button type="submit" className="btn-ghost text-xs">
            {row.goalCents === null ? "Definir meta" : "Guardar"}
          </button>
          {row.goalCents !== null ? (
            <span className="text-xs text-fg-faint">(apaga o valor para remover)</span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function AverageDelta({ row }: { row: AverageRow }) {
  if (row.monthsCounted === 0) return <span className="w-14" />;
  if (row.deltaCents === 0) return <span className="text-xs text-fg-faint">=</span>;
  const up = row.deltaCents > 0;
  const label =
    row.deltaPct === null ? "novo" : `${Math.abs(Math.round(row.deltaPct))}%`;
  return (
    <span className={`text-xs ${up ? "text-debt" : "text-credit"}`} title={`${up ? "Acima" : "Abaixo"} da média`}>
      {up ? "↑" : "↓"} {label}
    </span>
  );
}
