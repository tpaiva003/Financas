/**
 * O resumo de um grupo de bens, para se ler sem o abrir.
 *
 * **Porque é que isto existe.** Com os bens em acordeão, um cabeçalho que diga
 * só "Investimentos" obriga a abrir para saber se vale a pena abrir. O número
 * que se procura ao passar os olhos por esta página é quase sempre o mesmo —
 * quanto vale isto ao todo, e está a ganhar ou a perder — e esse cabe no
 * cabeçalho.
 *
 * **O ganho só existe onde há custo.** Uma conta bancária não tem "investido",
 * um imóvel tem o que custou mas não uma cotação; só os investimentos têm as
 * duas pontas. Onde não há, é `null` e o ecrã não mostra nada — em vez de um
 * zero, que se lê como "não ganhaste nada" quando o que se passa é que a
 * pergunta não se aplica.
 *
 * **Os que não têm preço atual ficam de fora do ganho e são contados.** Um
 * investimento sem cotação conta pelo que custou; incluí-lo no ganho dava um
 * zero que baixa a percentagem de toda a gente, e é por isso que o número de
 * ausentes vai junto.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { AssetKind } from "./networth";

/** O que este resumo precisa de saber de cada bem. */
export interface BemResumivel {
  kind: AssetKind;
  currentValueCents: number;
  quantity?: number | null;
  unitCostCents?: number | null;
  /** Não há preço atual para este bem. Ver o cabeçalho. */
  missingPrice?: boolean;
}

export interface ResumoDoTipo {
  kind: AssetKind;
  /** Quantos bens deste tipo. */
  quantos: number;
  valorCents: number;
  /** Custo do que ainda se tem. `null` quando o tipo não tem custo registado. */
  custoCents: number | null;
  /** `null` sem custo positivo: um ganho sobre custo zero não é um número. */
  ganhoCents: number | null;
  ganhoPct: number | null;
  /** Quantos ficaram de fora do ganho por não terem preço atual. */
  semPreco: number;
}

export function resumoDoTipo(
  kind: AssetKind,
  bens: readonly BemResumivel[],
): ResumoDoTipo {
  const doTipo = bens.filter((b) => b.kind === kind);
  const valorCents = doTipo.reduce((s, b) => s + b.currentValueCents, 0);

  /**
   * O custo só se soma onde ele existe mesmo.
   *
   * `quantity × unitCostCents` só quer dizer alguma coisa num investimento: é a
   * posição vezes o que ela custou. Aplicá-lo a uma conta ou a um imóvel dava
   * um produto de campos que ninguém preencheu com esse sentido.
   */
  const comCusto = doTipo.filter(
    (b) => typeof b.quantity === "number" && typeof b.unitCostCents === "number",
  );
  const custoCents =
    comCusto.length === 0
      ? null
      : comCusto.reduce((s, b) => s + Math.round((b.quantity ?? 0) * (b.unitCostCents ?? 0)), 0);

  // Os sem preço atual saem do ganho: contam pelo que custaram, e incluí-los
  // dava um zero que baixa a percentagem dos outros.
  const comPreco = comCusto.filter((b) => !b.missingPrice);
  const custoComPreco = comPreco.reduce(
    (s, b) => s + Math.round((b.quantity ?? 0) * (b.unitCostCents ?? 0)),
    0,
  );
  const valorComPreco = comPreco.reduce((s, b) => s + b.currentValueCents, 0);

  const ganhoCents = custoComPreco > 0 ? valorComPreco - custoComPreco : null;

  return {
    kind,
    quantos: doTipo.length,
    valorCents,
    custoCents,
    ganhoCents,
    ganhoPct:
      ganhoCents === null ? null : Math.round((ganhoCents / custoComPreco) * 1000) / 10,
    semPreco: comCusto.length - comPreco.length,
  };
}
