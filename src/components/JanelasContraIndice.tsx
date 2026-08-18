"use client";

/**
 * A carteira contra o índice em cada período: 1 dia, 7, 15, 1 mês, 3, 6, 1 ano.
 *
 * **Porque é que não chega a comparação desde o início.** Aquela responde a
 * "valeu a pena?" e esta a "como é que está a correr agora" — e as duas podem
 * ser verdade em sentidos opostos ao mesmo tempo. Uma carteira que bateu o
 * índice desde 2021 pode estar a perder para ele há três meses, e é essa a
 * informação que faz alguém mexer-se.
 *
 * **As percentagens da carteira são ponderadas no tempo.** Não são
 * `valor_hoje / valor_no_início`: essa conta trata um reforço como lucro e num
 * período curto chega a inventar dezenas por cento. Ver `desempenhoNaJanela`.
 *
 * **Uma linha que falta fica de fora em vez de aparecer a zero.** Um período
 * mais velho do que a carteira mediria menos tempo do que o rótulo promete, e
 * "1 ano: +4%" numa carteira de três meses é uma frase que se acredita.
 */

import type { DesempenhoDaJanela } from "@/lib/domain";

function pct(valor: number): string {
  return `${valor >= 0 ? "+" : "−"}${Math.abs(valor).toFixed(1).replace(".", ",")}%`;
}

/** "1 dia", "1 dia e 7 dias", "1 dia, 7 dias e 15 dias" — sem vírgula antes do "e". */
function listaLegivel(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

/** A diferença é em pontos percentuais, e chamar-lhe "%" seria outra coisa. */
function pontos(valor: number): string {
  return `${valor >= 0 ? "+" : "−"}${Math.abs(valor).toFixed(1).replace(".", ",")} pp`;
}

export function JanelasContraIndice({
  janelas,
  label,
}: {
  janelas: readonly DesempenhoDaJanela[];
  label: string;
}) {
  const comNumeros = janelas.filter(
    (j) => j.carteiraPct !== null && j.indicePct !== null && j.diferencaPct !== null,
  );
  if (comNumeros.length === 0) return null;

  /**
   * Os períodos que faltam, **com o nome**, agrupados pelo motivo.
   *
   * Sete linhas de traços eram ruído, e não dizer nada deixava a pessoa sem
   * perceber porque é que o "1 ano" desapareceu. Mas dizer só o motivo era
   * quase tão mau: lia-se um aviso sobre um fecho ao lado de cinco linhas
   * intactas, e não havia como saber que os que faltavam eram o de 1 dia e o
   * de 7. O nome do período é o que liga o aviso à ausência.
   */
  const porMotivo = new Map<string, string[]>();
  for (const j of janelas) {
    if (j.motivo === null) continue;
    porMotivo.set(j.motivo, [...(porMotivo.get(j.motivo) ?? []), j.label]);
  }

  return (
    <div className="mt-2">
      <table className="w-full text-xs">
        <caption className="sr-only">
          Rentabilidade da carteira e do {label} em cada período
        </caption>
        <thead>
          <tr className="text-fg-faint">
            <th scope="col" className="py-1 text-left font-normal">
              Período
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Carteira
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              {label}
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Dif.
            </th>
          </tr>
        </thead>
        <tbody>
          {comNumeros.map((j) => (
            <tr key={j.id} className="border-t border-line/60">
              <th scope="row" className="py-1 text-left font-normal text-fg-muted">
                {j.label}
              </th>
              <td className="py-1 text-right font-mono tnum text-fg">{pct(j.carteiraPct!)}</td>
              <td className="py-1 text-right font-mono tnum text-fg-muted">
                {pct(j.indicePct!)}
              </td>
              <td
                className={`py-1 text-right font-mono tnum ${
                  j.diferencaPct! >= 0 ? "text-credit" : "text-debt"
                }`}
              >
                {pontos(j.diferencaPct!)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {[...porMotivo.entries()].map(([motivo, labels]) => (
        <p key={motivo} className="mt-1 text-[11px] text-fg-faint">
          <span className="text-fg-muted">{listaLegivel(labels)}:</span> {motivo}
        </p>
      ))}
    </div>
  );
}
