import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import {
  getSpaceReport,
  REPORT_PERIODS,
  type ReportPeriodId,
  type Slice,
} from "@/lib/services/reports-service";
import { formatCents, type CategoryDelta, type MonthComparison } from "@/lib/domain";

export const metadata = { title: "Relatórios · Rachar" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const categories = await getRepository().listCategories(ctx.space.id);

  const periodo = (REPORT_PERIODS.find((p) => p.id === searchParams.periodo)?.id ??
    "12m") as ReportPeriodId;
  const report = await getSpaceReport(
    ctx.space.id,
    ctx.viewerMemberId,
    ctx.members,
    categories,
    periodo,
  );

  return (
    <div className="space-y-9">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">{ctx.space.name}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Relatórios</h1>
        </div>
        <a href="/api/export" className="btn-secondary">⬇ CSV</a>
      </div>

      {/* Período: sem isto os totais misturavam anos e não diziam nada. */}
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-hair p-1 text-sm">
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={p.id === "12m" ? "/relatorios" : `/relatorios?periodo=${p.id}`}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              p.id === periodo ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow">Total do ambiente · {report.periodLabel}</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight tnum">
            {formatCents(report.totalCents)}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{report.count} despesa(s)</p>
        </div>
        <div className="card p-6">
          <p className="eyebrow">A tua parte</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight tnum text-credit">
            {formatCents(report.myShareCents)}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            a tua quota nas partilhadas + as tuas pessoais
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow">Partilhadas</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tnum">
            {formatCents(report.sharedCents)}
          </p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Pessoais (tuas)</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tnum">
            {formatCents(report.personalCents)}
          </p>
        </div>
      </div>

      {report.count === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          Não há despesas confirmadas neste período.
        </p>
      ) : (
        <>
          {report.comparison.currentMonth ? (
            <MonthOverMonth c={report.comparison} />
          ) : null}
          <Section title="Por categoria">
            <BarList slices={report.byCategory} />
          </Section>
          <Section title="Quem pagou">
            <BarList slices={report.byPayer} />
          </Section>
          <Section title="Por mês">
            <BarList slices={report.byMonth} />
          </Section>
          {report.byMerchant.length > 0 ? (
            <Section title="Onde gastas mais">
              <BarList slices={report.byMerchant} />
            </Section>
          ) : null}
        </>
      )}

      <Link href="/despesas" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar às despesas
      </Link>
    </div>
  );
}

function MonthOverMonth({ c }: { c: MonthComparison }) {
  const rows = c.categories.filter((r) => r.currentCents !== 0 || r.previousCents !== 0).slice(0, 8);
  return (
    <section>
      <h2 className="eyebrow mb-3">
        {c.currentLabel} vs {c.previousLabel}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow">Este mês ({c.currentLabel})</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tnum">
            {formatCents(c.currentTotalCents)}
          </p>
          <div className="mt-1 text-sm">
            <DeltaInline deltaCents={c.totalDeltaCents} deltaPct={c.totalDeltaPct} suffix={`vs ${c.previousLabel}`} />
          </div>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Média móvel ({c.movingAvgMonths} {c.movingAvgMonths === 1 ? "mês" : "meses"})</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tnum text-fg-muted">
            {formatCents(c.movingAvgCents)}
          </p>
          <div className="mt-1 text-sm">
            <DeltaInline
              deltaCents={c.vsAverageCents}
              deltaPct={c.movingAvgCents !== 0 ? (c.vsAverageCents / Math.abs(c.movingAvgCents)) * 100 : null}
              suffix="vs a média"
            />
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="card mt-3 p-5">
          <p className="eyebrow mb-3">Por categoria</p>
          <ul className="space-y-3">
            {rows.map((r) => (
              <CategoryDeltaRow key={r.key} r={r} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CategoryDeltaRow({ r }: { r: CategoryDelta }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
        <span className="truncate text-fg">{r.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="font-mono tnum text-fg-muted">{formatCents(r.currentCents)}</span>
        <span className="w-[5.5rem] text-right">
          <DeltaBadge deltaCents={r.deltaCents} deltaPct={r.deltaPct} />
        </span>
      </span>
    </li>
  );
}

function DeltaBadge({ deltaCents, deltaPct }: { deltaCents: number; deltaPct: number | null }) {
  if (deltaCents === 0) {
    return <span className="font-mono text-xs text-fg-faint">=</span>;
  }
  const up = deltaCents > 0;
  // Mais despesa = sobe (vermelho/debt); menos = desce (verde/credit).
  const cls = up ? "text-debt" : "text-credit";
  const arrow = up ? "↑" : "↓";
  const label = deltaPct === null ? "novo" : `${Math.abs(Math.round(deltaPct))}%`;
  return (
    <span className={`font-mono text-xs tnum ${cls}`}>
      {arrow} {label}
    </span>
  );
}

function DeltaInline({
  deltaCents,
  deltaPct,
  suffix,
}: {
  deltaCents: number;
  deltaPct: number | null;
  suffix: string;
}) {
  if (deltaCents === 0) {
    return <span className="text-fg-faint">Sem variação {suffix}</span>;
  }
  const up = deltaCents > 0;
  const cls = up ? "text-debt" : "text-credit";
  const sign = up ? "+" : "−";
  const pctLabel = deltaPct === null ? "" : ` (${Math.abs(Math.round(deltaPct))}%)`;
  return (
    <span>
      <span className={`font-mono tnum ${cls}`}>
        {sign}{formatCents(Math.abs(deltaCents))}{pctLabel}
      </span>{" "}
      <span className="text-fg-faint">{suffix}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      <div className="card p-5">{children}</div>
    </section>
  );
}

function BarList({ slices }: { slices: Slice[] }) {
  const max = Math.max(1, ...slices.map((s) => Math.abs(s.amountCents)));
  return (
    <ul className="space-y-3">
      {slices.map((s) => {
        const pct = Math.max(2, (Math.abs(s.amountCents) / max) * 100);
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-fg">{s.label}</span>
              <span className="shrink-0 font-mono tnum text-fg-muted">
                {formatCents(s.amountCents)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: s.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
