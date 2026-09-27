/**
 * Gráfico de barras dos totais mensais, com a linha de referência da comparação
 * escolhida. SVG puro: sem dependências e legível no tema escuro.
 */

import { formatCents, type MonthPoint } from "@/lib/domain";

export function MonthlyChart({
  series,
  baselineCents,
  baselineLabel,
  currentYm,
}: {
  series: MonthPoint[];
  baselineCents: number;
  baselineLabel: string;
  currentYm: string | null;
}) {
  if (series.length === 0) return null;

  // Só os últimos 12 meses: mais do que isso fica ilegível no telemóvel.
  const points = series.slice(-12);
  const max = Math.max(baselineCents, ...points.map((p) => Math.abs(p.totalCents)), 1);

  const W = 100; // coordenadas relativas; o SVG escala com o contentor
  const H = 42;
  const gap = 1.6;
  const barW = (W - gap * (points.length - 1)) / points.length;
  const y = (cents: number) => H - (Math.abs(cents) / max) * H;
  const baselineY = y(baselineCents);

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Evolução mensal</p>
        {baselineCents > 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
            <span className="mr-1 inline-block h-[2px] w-4 align-middle bg-fg-faint" />
            {baselineLabel}: <span className="dinheiro">{formatCents(baselineCents)}</span>
          </p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full overflow-visible"
        role="img"
        aria-label={`Total por mês nos últimos ${points.length} meses`}
      >
        {points.map((p, i) => {
          const x = i * (barW + gap);
          const top = y(p.totalCents);
          const isCurrent = p.ym === currentYm;
          return (
            <rect
              key={p.ym}
              x={x}
              y={top}
              width={barW}
              height={Math.max(H - top, 0.6)}
              rx={0.8}
              className={isCurrent ? "fill-credit" : "fill-fg/25"}
            >
              <title>{`${p.label}: ${formatCents(p.totalCents)}`}</title>
            </rect>
          );
        })}

        {/* Linha da referência: mostra num relance se o mês está acima ou abaixo. */}
        {baselineCents > 0 ? (
          <line
            x1={0}
            x2={W}
            y1={baselineY}
            y2={baselineY}
            className="stroke-fg-faint"
            strokeWidth={0.4}
            strokeDasharray="2 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
        <span>{points[0]!.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]!.label}</span> : null}
        <span>{points.at(-1)!.label}</span>
      </div>
    </div>
  );
}
