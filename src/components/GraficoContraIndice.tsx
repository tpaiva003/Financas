"use client";

/**
 * A carteira e o índice, uma linha cada, ao longo do tempo.
 *
 * **Porque é que o número sozinho não chegava.** "Estás atrás 8 832 €" é a
 * mesma frase para duas situações opostas: quem esteve vinte mil atrás e hoje
 * está oito está a recuperar; quem esteve a par e hoje está oito atrás está a
 * perder terreno. Sem o caminho, o número não distingue as duas — e a decisão
 * que se toma a seguir é diferente.
 *
 * **As duas linhas partilham o eixo, de propósito.** São a mesma unidade — euros
 * do mesmo dinheiro — e é a distância entre elas que se veio aqui ler. Dar um
 * eixo a cada uma tornava essa distância um acidente do desenho.
 *
 * **O eixo começa em zero.** Ao contrário do gráfico do historial de uma
 * empresa, aqui não se corta: um corte exagera a distância entre as linhas, que
 * é precisamente a coisa que este gráfico existe para medir.
 */

import { formatCents, rumoDoDesnivel, type PontoDaComparacao } from "@/lib/domain";

const W = 320;
const H = 110;

function mesLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("pt-PT", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function GraficoContraIndice({
  pontos,
  label,
}: {
  pontos: readonly PontoDaComparacao[];
  label: string;
}) {
  // Com um ponto não há caminho nenhum para mostrar, e uma linha de um ponto
  // não se distingue de um erro.
  if (pontos.length < 2) return null;

  const maximo = Math.max(...pontos.flatMap((p) => [p.carteiraCents, p.indiceCents]), 1);
  const x = (i: number) => (i / (pontos.length - 1)) * W;
  const y = (v: number) => H - (v / maximo) * (H - 6);

  const linha = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const rumo = rumoDoDesnivel(pontos);
  const ultimo = pontos[pontos.length - 1]!;

  return (
    <div className="mt-3 space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`A tua carteira contra o ${label}, de ${pontos[0]!.mes} a ${ultimo.mes}`}
      >
        {/* A área entre as duas linhas é o desnível. Verde quando estás à
            frente, vermelha quando estás atrás — sem ela, é preciso medir a
            distância com os olhos. */}
        <path
          d={`${linha(pontos.map((p) => p.carteiraCents))} L ${x(pontos.length - 1)} ${y(
            ultimo.indiceCents,
          )} ${pontos
            .map((p, i) => `L ${x(pontos.length - 1 - i).toFixed(1)} ${y([...pontos].reverse()[i]!.indiceCents).toFixed(1)}`)
            .join(" ")} Z`}
          className={ultimo.diferencaCents >= 0 ? "fill-credit/15" : "fill-debt/15"}
        />
        <path
          d={linha(pontos.map((p) => p.indiceCents))}
          fill="none"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          className="stroke-fg-faint"
        />
        <path
          d={linha(pontos.map((p) => p.carteiraCents))}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-fg"
        />
      </svg>

      <div className="flex justify-between font-mono text-[10px] text-fg-faint">
        <span>{mesLabel(pontos[0]!.mes)}</span>
        <span>{mesLabel(ultimo.mes)}</span>
      </div>

      <p className="text-xs leading-snug text-fg-muted">
        <span className="text-fg">Linha cheia</span> és tu,{" "}
        <span className="text-fg-faint">tracejada</span> é o índice com o mesmo
        dinheiro nas mesmas datas.
        {rumo ? (
          <>
            {" "}
            O desnível passou de{" "}
            <span className="font-mono tnum">{formatCents(rumo.de)}</span> para{" "}
            <span className={`font-mono tnum ${rumo.melhorou ? "text-credit" : "text-debt"}`}>
              {formatCents(rumo.para)}
            </span>
            {/* O que interessa não é o sinal, é a direção: estar atrás e a
                recuperar é uma situação diferente de estar atrás e a afastar-se,
                e o mesmo número serve as duas. */}
            {rumo.melhorou ? " — está a fechar." : " — está a abrir."}
          </>
        ) : null}
      </p>
    </div>
  );
}
