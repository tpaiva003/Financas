"use client";

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

import { useState } from "react";
import { formatCents, type NetWorthSeries } from "@/lib/domain";
import type {
  CapturaEstado,
  LinhaDeIndice,
} from "@/lib/services/networth-history-service";

/** Quantos pontos cabem sem ficar ilegível no telemóvel. */
const MAX_PONTOS = 24;

/**
 * Um traçado que se parte nos buracos em vez de os atravessar.
 *
 * É a regra da linha do património aplicada às outras: ligar dois pontos por
 * cima de meses de que não se sabe nada afirma uma coisa sobre eles. O primeiro
 * segmento depois de um buraco é um "move", não um "line".
 */
function tracarComBuracos(
  valores: readonly (number | null)[],
  x: (i: number) => number,
  y: (cents: number) => number,
): string {
  let recomeca = true;
  return valores
    .map((v, i) => {
      if (v === null) {
        recomeca = true;
        return null;
      }
      const seg = `${recomeca ? "M" : "L"}${x(i)},${y(v)}`;
      recomeca = false;
      return seg;
    })
    .filter((seg): seg is string => seg !== null)
    .join(" ");
}

/** Que tipos de bem ganham linha própria, e como se chamam. */
const TIPOS_COM_LINHA: { id: string; label: string }[] = [
  { id: "investimento", label: "Investimentos" },
  { id: "imovel", label: "Imóveis" },
];

export function NetWorthChart({
  series,
  captura,
  indices = [],
}: {
  series: NetWorthSeries;
  /** O que aconteceu à fotografia de hoje. */
  captura?: CapturaEstado;
  /** As linhas dos índices, a partir do mesmo ponto. Ver a nota em baixo. */
  indices?: LinhaDeIndice[];
}) {
  /**
   * O ponto sob o rato ou sob o dedo.
   *
   * Os `<title>` do SVG davam uma dica nativa e não chegavam: os pontos têm
   * menos de um ponto de raio no sistema de coordenadas, o desenho é esticado
   * com `preserveAspectRatio="none"`, e acertar num deles com o rato é uma
   * questão de sorte. No telemóvel não há sequer *hover*.
   *
   * A solução é uma faixa invisível por ponto, do topo ao fundo: acerta-se
   * sempre, e o mesmo gesto funciona com o dedo.
   */
  const [sobre, setSobre] = useState<number | null>(null);
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

  /**
   * As linhas dos índices, cortadas ao mesmo número de pontos que a série.
   *
   * Entram na escala: sem isso, um índice que subiu mais do que o património
   * saía por cima do desenho e desaparecia — o que se leria como se ele não
   * tivesse subido.
   */
  const linhasIndice = indices
    .map((l) => ({ ...l, valores: l.valores.slice(-MAX_PONTOS) }))
    .filter((l) => l.valores.some((v) => v !== null));

  /**
   * As linhas por tipo de bem, tiradas da repartição gravada em cada
   * fotografia.
   *
   * Um ponto sem repartição — os reconstruídos não a têm — fica a `null` e a
   * linha parte-se ali. Zero seria dizer que naquele mês não havia imóveis,
   * quando o que não havia era o registo.
   *
   * Só entram os tipos com pelo menos dois pontos: com um só não há linha
   * nenhuma para desenhar, e um ponto solto no meio do gráfico não se lê.
   */
  const linhasPorTipo = TIPOS_COM_LINHA.map((t) => ({
    ...t,
    valores: points.map((p) => {
      const v = p.porTipo?.[t.id];
      return typeof v === "number" ? v : null;
    }),
  })).filter((l) => l.valores.filter((v) => v !== null).length >= 2);

  const valores = [
    ...points.map((p) => p.netCents),
    ...linhasIndice.flatMap((l) => l.valores.filter((v): v is number => v !== null)),
    // Os tipos também: um imóvel de 400 mil por cima de um líquido de 300 mil
    // saía fora do desenho, e uma linha que desaparece lê-se como uma linha
    // que não existe.
    ...linhasPorTipo.flatMap((l) => l.valores.filter((v): v is number => v !== null)),
  ];
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

      {/*
        A leitura do ponto escolhido, num sítio fixo.

        Fica **por cima** do gráfico e não numa caixa flutuante: uma caixa que
        segue o rato tapa a linha e não existe no telemóvel. Aqui o número
        aparece sempre no mesmo lugar, o que também o torna comparável enquanto
        se percorre a série.

        Sem ponto escolhido mostra-se o último — assim a linha nunca está vazia
        e não há salto de altura ao passar o rato.
      */}
      {linhasPorTipo.length > 0 ? (
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-faint">
          {linhasPorTipo.map((l) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-block h-0 w-4 border-t ${l.id === "investimento" ? "border-credit/60" : "border-fg/50"}`}
              />
              {l.label}
            </span>
          ))}
          <span>dentro do total, e não somados a ele.</span>
        </p>
      ) : null}

      {linhasIndice.length > 0 ? (
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-faint">
          {linhasIndice.map((l, k) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-block h-0 w-4 border-t ${k === 0 ? "border-dashed border-fg/40" : "border-dotted border-fg/30"}`}
              />
              {l.label}
            </span>
          ))}
          <span>
            partindo do mesmo valor, e sem os teus reforços — é contexto, não é
            comparação.
          </span>
        </p>
      ) : null}

      {(() => {
        const i = sobre ?? points.length - 1;
        const p = points[i];
        if (!p) return null;
        const anterior = i > 0 ? points[i - 1] : null;
        const delta = anterior ? p.netCents - anterior.netCents : null;
        return (
          <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-mono uppercase tracking-[0.04em] text-fg-faint">
              {p.label}
            </span>
            <span className="font-mono tnum text-fg">{formatCents(p.netCents)}</span>
            {delta !== null ? (
              <span className={`font-mono tnum ${delta >= 0 ? "text-credit" : "text-debt"}`}>
                {delta >= 0 ? "+" : ""}
                {formatCents(delta)} no mês
              </span>
            ) : null}
            {p.estimado ? <span className="text-fg-faint">reconstruído</span> : null}
            {sobre === null ? (
              <span className="text-fg-faint">— passa o rato pelo gráfico</span>
            ) : null}
          </p>
        );
      })()}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full overflow-visible"
        role="img"
        aria-label={`Património líquido de ${points[0]!.label} a ${points.at(-1)!.label}`}
        onMouseLeave={() => setSobre(null)}
        onPointerLeave={() => setSobre(null)}
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

        {/*
          As linhas por tipo de bem: investimentos e imóveis.

          Vão a cheio e finas, e não a tracejado como os índices, porque isto é
          medido e aquilo é contexto. Só aparecem onde há repartição gravada —
          os pontos reconstruídos não a têm, porque a reconstrução sabe somar o
          total e não sabe reparti-lo.
        */}
        {linhasPorTipo.map((l) => {
          const d = tracarComBuracos(l.valores, x, y);
          if (!d) return null;
          return (
            <path
              key={l.id}
              d={d}
              fill="none"
              className={l.id === "investimento" ? "stroke-credit/50" : "stroke-fg/40"}
              strokeWidth={0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/*
          Os índices, a tracejado fino e por baixo da linha do património: são
          contexto, não são a coisa que se veio ver.
        */}
        {linhasIndice.map((l, k) => {
          const d = tracarComBuracos(l.valores, x, y);
          if (!d) return null;
          return (
            <path
              key={l.id}
              d={d}
              fill="none"
              className={k === 0 ? "stroke-fg/30" : "stroke-fg/20"}
              strokeWidth={0.8}
              strokeDasharray={k === 0 ? "2 2" : "1 2"}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* A guia vertical do ponto escolhido. Ajuda a ler a data em baixo. */}
        {sobre !== null && points[sobre] ? (
          <line
            x1={x(sobre)}
            x2={x(sobre)}
            y1={0}
            y2={H}
            className="stroke-fg/25"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {points.map((p, i) => (
          <circle
            key={p.onDate}
            cx={x(i)}
            cy={y(p.netCents)}
            r={sobre === i ? 1.6 : p.estimado ? 0.6 : 0.9}
            className={
              sobre === i ? "fill-fg" : p.estimado ? "fill-fg/25" : "fill-fg/60"
            }
          />
        ))}

        {/*
          As faixas de deteção, invisíveis e do topo ao fundo.
          São a última coisa desenhada para ficarem por cima de tudo, e por isso
          apanham o ponteiro em qualquer altura da coluna.
        */}
        {points.map((p, i) => {
          const largura = points.length > 1 ? W / (points.length - 1) : W;
          return (
            <rect
              key={`hit-${p.onDate}`}
              x={Math.max(0, x(i) - largura / 2)}
              y={0}
              width={largura}
              height={H}
              fill="transparent"
              onMouseEnter={() => setSobre(i)}
              onPointerDown={() => setSobre(i)}
              onPointerMove={() => setSobre(i)}
            />
          );
        })}
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
