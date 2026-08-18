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
   * O primeiro motivo em falta, dito uma vez.
   *
   * Sete linhas de traços eram ruído, e não dizer nada deixava a pessoa sem
   * perceber porque é que o "1 ano" desapareceu. Os motivos que faltam são
   * quase sempre o mesmo — a carteira ainda não tem essa idade — por isso
   * chega o primeiro.
   */
  const emFalta = janelas.find((j) => j.motivo !== null)?.motivo ?? null;

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
      {emFalta ? <p className="mt-1 text-[11px] text-fg-faint">{emFalta}</p> : null}
    </div>
  );
}
