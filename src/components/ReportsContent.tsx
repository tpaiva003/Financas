import { Suspense } from "react";
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
import {
  formatCents,
  monthLabel,
  sameMonthLastYear,
  type BaselineMode,
  type CategoryDelta,
  type MonthComparison,
} from "@/lib/domain";
import { MonthlyChart } from "@/components/MonthlyChart";
import { CategoryAverages } from "@/components/CategoryAverages";

export type ReportView = "resumo" | "categorias" | "evolucao";

/**
 * Conteúdo dos relatórios, dividido em vistas.
 *
 * Estava tudo numa página só, o que dava um rolo interminável onde nada se
 * encontrava. Passa a haver três entradas na secção Análise, cada uma a
 * responder a uma pergunta: como estou (resumo), em que gasto (categorias),
 * como evoluiu (evolução).
 */
export async function ReportsContent({
  view,
  searchParams,
}: {
  view: ReportView;
  searchParams: { periodo?: string; comparar?: string; media?: string };
}) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const periodo = (REPORT_PERIODS.find((p) => p.id === searchParams.periodo)?.id ??
    "12m") as ReportPeriodId;
  const comparar = (COMPARISONS.find((c) => c.id === searchParams.comparar)?.id ??
    "previous") as BaselineMode;
  const media = AVERAGE_WINDOWS.includes(Number(searchParams.media) as 3 | 6 | 12)
    ? (Number(searchParams.media) as 3 | 6 | 12)
    : 3;

  const href = fazerHref(view, periodo, comparar, media);

  return (
    <div className="space-y-9">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">{ctx.space.name}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {view === "categorias" ? "Categorias" : view === "evolucao" ? "Evolução" : "Resumo"}
          </h1>
        </div>
        <a href="/api/export" className="btn-secondary">⬇ CSV</a>
      </div>

      {/* Período: sem isto os totais misturavam anos e não diziam nada. */}
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-hair p-1 text-sm">
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={href({ periodo: p.id })}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              p.id === periodo ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Tudo o que precisa do relatório flui atrás de Suspense: os seletores
          lá de cima ficam clicáveis IMEDIATAMENTE, e o trabalho caro (todas as
          despesas + comerciantes) chega quando chegar. */}
      <Suspense fallback={<RelatorioAEncher />}>
        <CorpoDoRelatorio
          view={view}
          periodo={periodo}
          comparar={comparar}
          media={media}
          spaceId={ctx.space.id}
          viewerMemberId={ctx.viewerMemberId}
          members={ctx.members}
        />
      </Suspense>

      <Link href="/despesas" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar às despesas
      </Link>
    </div>
  );
}

/** As esperas com a forma do que vai aparecer, para a página não saltar. */
function RelatorioAEncher() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">A preparar o relatório…</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card h-32 animate-pulse p-6" />
        <div className="card h-32 animate-pulse p-6" />
      </div>
      <div className="card h-56 animate-pulse p-6" />
    </div>
  );
}

async function CorpoDoRelatorio({
  view,
  periodo,
  comparar,
  media,
  spaceId,
  viewerMemberId,
  members,
}: {
  view: ReportView;
  periodo: ReportPeriodId;
  comparar: BaselineMode;
  media: 3 | 6 | 12;
  spaceId: string;
  viewerMemberId: string;
  members: Parameters<typeof getSpaceReport>[2];
}) {
  const categories = await getRepository().listCategories(spaceId);
  const report = await getSpaceReport(
    spaceId,
    viewerMemberId,
    members,
    categories,
    periodo,
    comparar,
    media,
  );
  const href = fazerHref(view, periodo, comparar, media);

  return (
    <div className="space-y-9">
      {view === "resumo" ? (
      <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-6">
          <p className="eyebrow">Total do ambiente · {report.periodLabel}</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight tnum">
            <span className="dinheiro">{formatCents(report.totalCents)}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted">{report.count} despesa(s)</p>
        </div>
        <div className="card p-6">
          <p className="eyebrow">A tua parte</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight tnum text-credit">
            <span className="dinheiro">{formatCents(report.myShareCents)}</span>
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
            <span className="dinheiro">{formatCents(report.sharedCents)}</span>
          </p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Pessoais (tuas)</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tnum">
            <span className="dinheiro">{formatCents(report.personalCents)}</span>
          </p>
        </div>
      </div>
      </>
      ) : null}

      {view !== "evolucao" ? (
      <div>
        <p className="label">Comparar com</p>
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-hair p-1 text-sm">
          {COMPARISONS.map((c) => (
            <Link
              key={c.id}
              href={href({ comparar: c.id })}
              className={`rounded-full px-3.5 py-1.5 transition-colors ${
                c.id === comparar ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
        {comparar === "yoy" && report.comparison.currentMonth && !report.comparison.sameMonthLastYear ? (
          <p className="mt-2 text-xs text-fg-faint">
            {/* O mês homólogo pelo nome. Dizer "ago 26 do ano anterior" era
                confuso: o rótulo já traz o ano, e a frase parecia dizer duas
                coisas contraditórias. */}
            Ainda não há dados de{" "}
            {monthLabel(sameMonthLastYear(report.comparison.currentMonth))} para comparar com{" "}
            {report.comparison.currentLabel}.
          </p>
        ) : null}
      </div>
      ) : null}

      {report.count === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          Não há despesas confirmadas neste período.
        </p>
      ) : (
        <>
          {view !== "categorias" && report.comparison.series.length > 0 ? (
            <MonthlyChart
              series={report.comparison.series}
              baselineCents={report.comparison.baselineTotalCents}
              baselineLabel={report.comparison.baselineLabel}
              currentYm={report.comparison.currentMonth}
            />
          ) : null}
          {view === "resumo" && report.comparison.currentMonth ? (
            <MonthOverMonth c={report.comparison} />
          ) : null}

          {/* Média mensal por categoria e metas ajustáveis. */}
          {view === "categorias" ? (
          <>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="eyebrow mb-0">Por categoria · média e homólogo</h2>
              {/* Distinto do seletor de período lá em cima: aqui é a janela da
                  média, e sem rótulo os dois liam-se como o mesmo controlo. */}
              <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
                média de
              </span>
              <div className="flex items-center gap-1 rounded-full border border-hair p-1 text-xs">
                {AVERAGE_WINDOWS.map((w) => (
                  <Link
                    key={w}
                    href={href({ media: w })}
                    className={`rounded-full px-3 py-1 transition-colors ${
                      w === media ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {w}
                  </Link>
                ))}
              </div>
              </div>
            </div>
            <CategoryAverages
              averages={report.categoryAverages}
              monthLabel={report.comparison.currentLabel}
              editable
            />
          </section>

          {report.merchantAverages.rows.length > 0 ? (
            <section>
              <h2 className="eyebrow mb-3">Por comerciante · média e homólogo</h2>
              <CategoryAverages
                averages={{
                  ...report.merchantAverages,
                  // Só os maiores: a lista completa seria ruído.
                  rows: report.merchantAverages.rows.slice(0, 8),
                  total: null,
                }}
                monthLabel={report.comparison.currentLabel}
                editable={false}
              />
            </section>
          ) : null}

          <Section title="Por categoria">
            <BarList slices={report.byCategory} />
          </Section>
          {report.byMerchant.length > 0 ? (
            <Section title="Onde gastas mais">
              <BarList slices={report.byMerchant} />
            </Section>
          ) : null}
          </>
          ) : null}

          {view === "evolucao" ? (
          <>
          <Section title="Por mês">
            <BarList slices={report.byMonth} />
          </Section>
          <Section title="Quem pagou">
            <BarList slices={report.byPayer} />
          </Section>
          </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Mantém as outras escolhas ao trocar de período, comparação ou média. */
function fazerHref(
  view: ReportView,
  periodo: ReportPeriodId,
  comparar: BaselineMode,
  media: 3 | 6 | 12,
) {
  return (patch: { periodo?: string; comparar?: string; media?: number }) => {
    const p = new URLSearchParams();
    const per = patch.periodo ?? periodo;
    const cmp = patch.comparar ?? comparar;
    const med = patch.media ?? media;
    if (per !== "12m") p.set("periodo", per);
    if (cmp !== "previous") p.set("comparar", cmp);
    if (med !== 3) p.set("media", String(med));
    const path =
      view === "categorias"
        ? "/relatorios/categorias"
        : view === "evolucao"
          ? "/relatorios/evolucao"
          : "/relatorios";
    return p.toString() ? `${path}?${p}` : path;
  };
}

const COMPARISONS = [
  { id: "previous", label: "Mês anterior" },
  { id: "average", label: "Média" },
  { id: "yoy", label: "Homólogo" },
] as const;

// Janela das médias por categoria: quantos meses anteriores entram na conta.
const AVERAGE_WINDOWS = [3, 6, 12] as const;

function MonthOverMonth({ c }: { c: MonthComparison }) {
  const rows = c.categories.filter((r) => r.currentCents !== 0 || r.previousCents !== 0).slice(0, 8);
  return (
    <section>
      <h2 className="eyebrow mb-3">
        {c.currentLabel} vs {c.baselineLabel}
      </h2>

      {/*
        Dito uma vez, em vez de repetido em cada número. Sem isto, um total de
        meio mês ao lado de um mês inteiro lê-se como uma poupança — e a
        referência já vem cortada, mas quem lê não tem como saber disso.
      */}
      {c.partial ? (
        <p className="mb-3 text-xs text-fg-muted">
          {c.currentLabel} vai em curso: os dois lados contam só até ao dia{" "}
          {c.throughDay}, senão a diferença era só calendário.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow">Este mês ({c.currentLabel})</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tnum">
            <span className="dinheiro">{formatCents(c.currentTotalCents)}</span>
          </p>
          <div className="mt-1 text-sm">
            <DeltaInline
              deltaCents={c.baselineDeltaCents}
              deltaPct={c.baselineDeltaPct}
              suffix={`vs ${c.baselineLabel}`}
            />
          </div>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Referência · {c.baselineLabel}</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tnum text-fg-muted">
            <span className="dinheiro">{formatCents(c.baselineTotalCents)}</span>
          </p>
          <p className="mt-1 text-sm text-fg-faint">
            média móvel de {c.movingAvgMonths} {c.movingAvgMonths === 1 ? "mês" : "meses"}:{" "}
            <span className="tnum"><span className="dinheiro">{formatCents(c.movingAvgCents)}</span></span>
          </p>
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
        <span className="font-mono tnum text-fg-muted"><span className="dinheiro">{formatCents(r.currentCents)}</span></span>
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
        {sign}<span className="dinheiro">{formatCents(Math.abs(deltaCents))}</span>{pctLabel}
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
                <span className="dinheiro">{formatCents(s.amountCents)}</span>
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
