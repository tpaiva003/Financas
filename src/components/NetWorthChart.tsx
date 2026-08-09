/**
 * A evolução do património ao longo do tempo. SVG puro, como o gráfico mensal:
 * sem dependências e legível nos dois temas.
 *
 * **A linha do zero desenha-se sempre que há valores negativos.** Um património
 * líquido negativo — dívida a mais do que bens, que é o normal nos primeiros
 * anos de um crédito à habitação — sem a linha do zero desenhava-se igual a um
 * património positivo pequeno, e a leitura saía ao contrário.
 *
 * **Não se interpola.** Se faltarem meses no meio, os pontos ficam mais
 * afastados e vê-se que ficam. Ligá-los com um traço a direito era afirmar uma
 * coisa sobre meses de que não se sabe nada.
 */

import { formatCents, type NetWorthSeries } from "@/lib/domain";

/** Quantos pontos cabem sem ficar ilegível no telemóvel. */
const MAX_PONTOS = 24;

export function NetWorthChart({ series }: { series: NetWorthSeries }) {
  const points = series.points.slice(-MAX_PONTOS);

  // Com um ponto só não há evolução nenhuma para mostrar — e é isso que se diz,
  // em vez de um gráfico com um traço solitário que ninguém sabe ler.
  if (points.length < 2) {
    return (
      <div className="card p-5">
        <p className="eyebrow mb-2">Evolução do património</p>
        <p className="text-sm text-fg-muted">
          {points.length === 0
            ? "Ainda não há histórico."
            : `Há uma fotografia, de ${points[0]!.label}.`}{" "}
          O património de antes não se reconstrói — cada bem só sabe o que vale
          hoje. Guarda-se uma fotografia por dia a partir de agora, e o gráfico
          aparece com a segunda.
        </p>
      </div>
    );
  }

  const valores = points.map((p) => p.netCents);
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  // Uma folga em cima e em baixo, para a linha não encostar às bordas. E o
  // zero entra sempre no intervalo quando há negativos: sem ele, uma série toda
  // negativa desenhava-se igual a uma toda positiva.
  const topo = Math.max(max, 0);
  const base = Math.min(min, 0);
  const amplitude = topo - base || Math.abs(topo) || 1;
  const folga = amplitude * 0.08;

  const W = 100;
  const H = 42;
  const y = (cents: number) => H - ((cents - base + folga) / (amplitude + folga * 2)) * H;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);

  const linha = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.netCents)}`).join(" ");
  const area = `${linha} L${x(points.length - 1)},${y(base)} L${x(0)},${y(base)} Z`;
  const zeroY = y(0);
  const mostraZero = base < 0;

  const subiu = (series.changeCents ?? 0) >= 0;

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Evolução do património</p>
        {series.changeCents !== null ? (
          <p className={`font-mono text-xs tnum ${subiu ? "text-credit" : "text-debt"}`}>
            {subiu ? "+" : ""}
            {formatCents(series.changeCents)}
            {/* Só há percentagem quando se parte de um património positivo: de
                -50 mil para -10 mil a divisão dá o sinal ao contrário do que
                aconteceu. Sem ela, mostra-se a variação em euros e mais nada. */}
            {series.changePct !== null
              ? ` (${series.changePct >= 0 ? "+" : ""}${Math.round(series.changePct)}%)`
              : ""}
          </p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full overflow-visible"
        role="img"
        aria-label={`Património líquido de ${points[0]!.label} a ${points.at(-1)!.label}`}
      >
        <path d={area} className={subiu ? "fill-credit/10" : "fill-debt/10"} />
        <path
          d={linha}
          fill="none"
          className={subiu ? "stroke-credit" : "stroke-debt"}
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {mostraZero ? (
          <line
            x1={0}
            x2={W}
            y1={zeroY}
            y2={zeroY}
            className="stroke-fg-faint"
            strokeWidth={0.4}
            strokeDasharray="2 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {points.map((p, i) => (
          <circle key={p.onDate} cx={x(i)} cy={y(p.netCents)} r={0.9} className="fill-fg/60">
            <title>{`${p.label}: ${formatCents(p.netCents)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
        <span>{points[0]!.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]!.label}</span> : null}
        <span>{points.at(-1)!.label}</span>
      </div>

      {mostraZero ? (
        <p className="mt-2 text-[11px] leading-snug text-fg-faint">
          O tracejado é o zero: abaixo dele, as dívidas ainda são mais do que os
          bens.
        </p>
      ) : null}
    </div>
  );
}
