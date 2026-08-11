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
import type { CapturaEstado } from "@/lib/services/networth-history-service";

/** Quantos pontos cabem sem ficar ilegível no telemóvel. */
const MAX_PONTOS = 24;

export function NetWorthChart({
  series,
  captura,
}: {
  series: NetWorthSeries;
  /** O que aconteceu à fotografia de hoje. */
  captura?: CapturaEstado;
}) {
  const points = series.points.slice(-MAX_PONTOS);

  // Com um ponto só não há evolução nenhuma para mostrar — e é isso que se diz,
  // em vez de um gráfico com um traço solitário que ninguém sabe ler.
  if (points.length < 2) {
    /**
     * O estado vazio tem de dizer QUAL dos vazios é. Antes dizia sempre "o
     * histórico está a começar", o que era verdade no primeiro dia e mentira em
     * todos os outros se a escrita estivesse a falhar — e ninguém tinha como
     * saber a diferença.
     */
    if (captura === "falhou") {
      return (
        <div className="card p-5">
          <p className="eyebrow mb-2">Evolução do património</p>
          <p role="alert" className="text-sm text-debt">
            Não consegui guardar a fotografia de hoje. Enquanto isto durar não há
            histórico nenhum a acumular — se a migração `0027` não tiver sido
            corrida, a tabela ainda não existe.
          </p>
        </div>
      );
    }

    return (
      <div className="card p-5">
        <p className="eyebrow mb-2">Evolução do património</p>
        <p className="text-sm text-fg-muted">
          {points.length === 0
            ? captura === "sem-bens"
              ? "Ainda não há bens registados, por isso não há o que fotografar."
              : "A fotografia de hoje ficou guardada. É a primeira."
            : `Está guardada a fotografia de ${points[0]!.label}, com ${formatCents(points[0]!.netCents)}.`}
        </p>
        <p className="mt-2 text-xs text-fg-faint">
          O património de antes não se reconstrói — cada bem só sabe o que vale
          hoje, ao contrário das despesas, que são movimentos datados. Guarda-se
          uma por dia a partir de agora, e o gráfico aparece assim que houver
          duas.
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

  /**
   * Onde acaba o reconstruído e começa o medido.
   *
   * Os pontos estimados vêm todos antes dos medidos, porque o passado é o que
   * se reconstrói. A linha parte-se em dois traçados: o de trás a tracejado, o
   * da frente cheio. Desenhar tudo igual seria dar a uma conta o mesmo aspeto
   * que a uma medição — que é exatamente o que faz um número errado passar por
   * facto.
   */
  const ultimoEstimado = points.reduce((acc, p, i) => (p.estimado ? i : acc), -1);
  const temEstimado = ultimoEstimado >= 0;
  const traco = (de: number, ate: number) =>
    points
      .slice(de, ate + 1)
      .map((p, k) => `${k === 0 ? "M" : "L"}${x(de + k)},${y(p.netCents)}`)
      .join(" ");
  // O traçado estimado vai até ao primeiro ponto medido, para a linha não ter
  // um buraco na costura.
  const tracoEstimado = temEstimado ? traco(0, Math.min(ultimoEstimado + 1, points.length - 1)) : "";
  const tracoMedido = ultimoEstimado + 1 <= points.length - 1 ? traco(Math.max(ultimoEstimado, 0), points.length - 1) : "";

  /**
   * A variação em cima é a MEDIDA, quando a série começa numa reconstrução.
   *
   * A variação sobre a série toda compara o presente com um ponto que leva lá
   * dentro o saldo de hoje das contas e o valor de hoje dos imóveis projetados
   * para trás. Mede sobretudo a distância entre a estimativa e a realidade — e
   * dava "+297%" a alguém cujo património não triplicou. Uma percentagem é a
   * coisa mais fácil de acreditar de um gráfico: não se confere contra nada.
   *
   * Sem dois pontos medidos não há número honesto para pôr aqui, e então não se
   * põe nenhum: um "—" com a explicação ao lado é melhor do que uma
   * percentagem que se lê como uma conquista.
   */
  const usarMedido = series.comecaEstimado;
  const variacao = usarMedido ? series.medido : series;
  const cents = variacao ? variacao.changeCents : null;
  const pct = variacao ? variacao.changePct : null;
  const subiu = (cents ?? 0) >= 0;

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Evolução do património</p>
        {cents !== null ? (
          <p className={`font-mono text-xs tnum ${subiu ? "text-credit" : "text-debt"}`}>
            {subiu ? "+" : ""}
            {formatCents(cents)}
            {/* Só há percentagem quando se parte de um património positivo: de
                -50 mil para -10 mil a divisão dá o sinal ao contrário do que
                aconteceu. Sem ela, mostra-se a variação em euros e mais nada. */}
            {pct !== null ? ` (${pct >= 0 ? "+" : ""}${Math.round(pct)}%)` : ""}
            {usarMedido && series.medido ? (
              <span className="ml-1 text-fg-faint">desde {series.medido.dePeriodo}</span>
            ) : null}
          </p>
        ) : usarMedido ? (
          <p className="font-mono text-xs text-fg-faint">
            variação por medir
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
        {temEstimado ? (
          <path
            d={tracoEstimado}
            fill="none"
            className="stroke-fg-faint"
            strokeWidth={1.2}
            strokeDasharray="3 2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {tracoMedido ? (
          <path
            d={tracoMedido}
            fill="none"
            className={subiu ? "stroke-credit" : "stroke-debt"}
            strokeWidth={1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

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
          <circle
            key={p.onDate}
            cx={x(i)}
            cy={y(p.netCents)}
            r={p.estimado ? 0.6 : 0.9}
            className={p.estimado ? "fill-fg/25" : "fill-fg/60"}
          >
            <title>
              {`${p.label}: ${formatCents(p.netCents)}${p.estimado ? " (reconstruído)" : ""}`}
            </title>
          </circle>
        ))}
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
        <span>{points[0]!.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]!.label}</span> : null}
        <span>{points.at(-1)!.label}</span>
      </div>

      {temEstimado ? (
        <p className="mt-2 text-[11px] leading-snug text-fg-faint">
          <span className="mr-1 inline-block h-[2px] w-4 border-t-2 border-dashed border-fg-faint align-middle" />
          A parte a tracejado é <span className="text-fg-muted">reconstruída</span>, não
          medida: os investimentos saem dos teus movimentos e das cotações, o
          crédito da própria amortização, mas as contas e os imóveis entram ao
          valor de hoje — não guardam passado. Daí para a frente é o que foi
          mesmo registado.{" "}
          {series.medido
            ? `Por isso a variação em cima conta a partir de ${series.medido.dePeriodo}, que é a primeira fotografia a sério: comparar hoje com a reconstrução mediria sobretudo a distância entre ela e a realidade.`
            : "Ainda não há duas fotografias a sério para comparar, e por isso não se mostra variação nenhuma — a que sairia daqui seria contra a reconstrução."}
        </p>
      ) : null}

      {mostraZero ? (
        <p className="mt-2 text-[11px] leading-snug text-fg-faint">
          O tracejado horizontal é o zero: abaixo dele, as dívidas ainda são mais
          do que os bens.
        </p>
      ) : null}
    </div>
  );
}
