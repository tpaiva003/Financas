import { saveSpendingGoalAction } from "@/app/(app)/actions";
import { formatCents, type AverageRow, type AveragesResult, type GoalState } from "@/lib/domain";

const GOAL_STYLE: Record<GoalState, string> = {
  over: "text-debt",
  near: "text-fg",
  under: "text-credit",
  none: "text-fg-faint",
};

/** Valor em euros para pré-preencher o campo da meta (formato europeu). */
function euros(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function dayLabel(ym: string, day: number): string {
  const [, m] = ym.split("-");
  return `${day}/${Number(m)}`;
}

/**
 * Gasto do período por categoria, com a média e o período homólogo marcados na
 * própria barra (REQ-REL).
 *
 * O ponto que faz isto valer a pena: quando o mês ainda vai a meio, o homólogo
 * é cortado no MESMO dia. "5 € a 5 de agosto" só diz alguma coisa contra "50 €
 * a 5 de agosto do ano passado" — contra o mês inteiro do ano passado não diz
 * nada.
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
    (r) =>
      r.currentCents !== 0 ||
      r.averageCents !== 0 ||
      (r.yoyCents ?? 0) !== 0 ||
      r.goalCents !== null,
  );

  if (!averages.currentMonth || (rows.length === 0 && !averages.total)) {
    return (
      <p className="card p-6 text-center text-sm text-fg-muted">
        Ainda não há meses suficientes para calcular médias.
      </p>
    );
  }

  const cut = dayLabel(averages.currentMonth, averages.throughDay);

  // Uma escala só para todas as linhas: assim as barras também se comparam
  // entre si ("gasto mais no supermercado do que em transportes"). O total tem
  // escala própria — é sempre muito maior e esmagaria o resto.
  const scale = Math.max(
    1,
    ...rows.map((r) =>
      Math.max(Math.abs(r.currentCents), r.averageCents, r.yoyCents ?? 0, r.goalCents ?? 0),
    ),
  );

  // Sem meses anteriores e sem homólogo não há nada com que comparar: mostra-se
  // o gasto, sem marcas nem números vazios a fingir contexto.
  const hasReference = averages.monthsCounted > 0 || rows.some((r) => r.yoyCents !== null);

  return (
    <div className="card divide-y divide-hair2 p-0">
      <div className="space-y-2 p-5">
        <p className="text-xs text-fg-muted">
          {!hasReference ? (
            <>
              Só há um mês de dados ({monthLabel}). A partir do segundo mês aparece aqui a média;
              a partir do segundo ano, o período homólogo.
            </>
          ) : averages.partial ? (
            <>
              {monthLabel} vai em <span className="text-fg">{cut}</span>. O homólogo está cortado
              no mesmo dia, para a comparação ser justa — e a média mostra o mês inteiro, para se
              ver onde isto costuma ir dar.
            </>
          ) : (
            <>Mês completo ({monthLabel}), comparado com o mesmo período do ano anterior.</>
          )}
        </p>
        {/* Legenda das marcas da barra. */}
        {hasReference ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-sm bg-fg/60" /> este período
            </span>
            {averages.monthsCounted > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-0 border-l-2 border-dashed border-fg-faint" />{" "}
                média de {averages.monthsCounted}{" "}
                {averages.monthsCounted === 1 ? "mês" : "meses"}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-0 border-l-2 border-credit" /> homólogo
              {averages.partial ? ` até ${cut}` : ""}
            </span>
          </p>
        ) : null}
      </div>

      {averages.total ? (
        <BarRow
          row={averages.total}
          averages={averages}
          editable={editable}
          hasReference={hasReference}
          emphasis
        />
      ) : null}

      {rows.map((r) => (
        <BarRow
          key={r.key}
          row={r}
          averages={averages}
          editable={editable}
          hasReference={hasReference}
          scale={scale}
        />
      ))}
    </div>
  );
}

function BarRow({
  row,
  averages,
  editable,
  hasReference,
  scale: sharedScale,
  emphasis = false,
}: {
  row: AverageRow;
  averages: AveragesResult;
  editable: boolean;
  hasReference: boolean;
  /** Escala partilhada pelo painel; o total usa a sua. */
  scale?: number;
  emphasis?: boolean;
}) {
  // A escala inclui os valores de mês COMPLETO: assim uma barra curta a meio do
  // mês lê-se logo como "ainda vou a meio do costume", e não como "gastei pouco".
  const scale =
    sharedScale ??
    Math.max(Math.abs(row.currentCents), row.averageCents, row.yoyCents ?? 0, row.goalCents ?? 0, 1);
  const at = (cents: number) => `${Math.min(100, Math.max(0, (cents / scale) * 100))}%`;

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
          <YoyDelta row={row} />
        </p>
      </div>

      {/* Barra do período com a média (tracejado) e o homólogo (traço cheio). */}
      <div className="relative mt-2.5 h-3 w-full overflow-hidden rounded-full bg-panel2">
        {/* Estornos são negativos: a barra mostra a grandeza, o número o sinal. */}
        <div
          className="h-full rounded-full opacity-80"
          style={{ width: at(Math.abs(row.currentCents)), background: row.color }}
        />
        {row.averageCents > 0 ? (
          <span
            className="absolute inset-y-0 border-l-2 border-dashed border-fg-faint"
            style={{ left: at(row.averageCents) }}
            aria-hidden
          />
        ) : null}
        {row.yoyToDayCents !== null && row.yoyToDayCents > 0 ? (
          <span
            className="absolute inset-y-0 border-l-2 border-credit"
            style={{ left: at(row.yoyToDayCents) }}
            aria-hidden
          />
        ) : null}
      </div>

      {hasReference ? (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] tnum text-fg-faint">
          {averages.monthsCounted > 0 ? (
            <span>
              média <span className="text-fg-muted">{formatCents(row.averageCents)}</span>
              {averages.partial && row.averageToDayCents !== row.averageCents ? (
                <span>
                  {" "}
                  (até {dayLabel(averages.currentMonth!, averages.throughDay)}:{" "}
                  {formatCents(row.averageToDayCents)})
                </span>
              ) : null}
            </span>
          ) : null}
          {row.yoyToDayCents !== null ? (
            <span>
              homólogo <span className="text-fg-muted">{formatCents(row.yoyToDayCents)}</span>
              {averages.partial && row.yoyCents !== row.yoyToDayCents ? (
                <span> (mês inteiro: {formatCents(row.yoyCents ?? 0)})</span>
              ) : null}
            </span>
          ) : null}
        </p>
      ) : null}

      {/* Meta: só aparece a barra quando existe; definir fica recolhido. */}
      {row.goalCents !== null ? (
        <p className={`mt-1.5 text-xs ${GOAL_STYLE[row.goalState]}`}>
          {row.goalState === "over"
            ? `Passou a meta de ${formatCents(row.goalCents)} em ${formatCents(-row.goalRemainingCents!)}.`
            : `${Math.round(row.goalPct ?? 0)}% da meta de ${formatCents(row.goalCents)} · faltam ${formatCents(row.goalRemainingCents ?? 0)}.`}
        </p>
      ) : null}

      {editable ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.06em] text-fg-faint hover:text-fg-muted">
            {row.goalCents === null ? "Definir meta mensal" : "Alterar meta"}
          </summary>
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
            <button type="submit" className="btn-ghost text-xs">Guardar</button>
            <span className="text-xs text-fg-faint">apaga o valor para remover</span>
          </form>
        </details>
      ) : null}
    </div>
  );
}

/** Variação face ao homólogo até ao mesmo dia — a leitura que interessa. */
function YoyDelta({ row }: { row: AverageRow }) {
  // Nada gasto ainda: dizer "igual ao homólogo" seria ruído — e enganador
  // quando o homólogo também estava a zero nesse dia.
  if (row.currentCents === 0) {
    return <span className="text-xs text-fg-faint">ainda nada</span>;
  }
  if (row.yoyDeltaCents === null) return null;
  if (row.yoyDeltaCents === 0) {
    return <span className="text-xs text-fg-faint">= homólogo</span>;
  }
  const up = row.yoyDeltaCents > 0;
  const label = row.yoyDeltaPct === null ? "novo" : `${Math.abs(Math.round(row.yoyDeltaPct))}%`;
  return (
    <span
      className={`text-xs ${up ? "text-debt" : "text-credit"}`}
      title={`${up ? "Acima" : "Abaixo"} do período homólogo`}
    >
      {up ? "↑" : "↓"} {label} vs homólogo
    </span>
  );
}
