/**
 * Investimentos que ficaram sem a compra que lhes deu origem.
 *
 * **De onde vêm.** Antes de registar um investimento passar a criar o
 * movimento, o formulário gravava a posição escrita no próprio bem: "100
 * unidades a 12 €" e mais nada. Esses continuam lá, com um histórico vazio —
 * sem TIR, sem TWR e sem comparação com o índice — e nada na app lhes toca
 * sozinho.
 *
 * **Porque é que a app não os arranja calada.** Um movimento precisa de uma
 * data, e a data não é um detalhe: é ela que diz quanto tempo o dinheiro esteve
 * a render. Inventar "hoje" para uma posição comprada há três anos daria uma
 * TIR absurda com ar de conta feita — e um número errado com ar de resposta é
 * pior do que não ter número nenhum. Por isso a app pergunta, com a data de
 * compra já preenchida quando o bem a tem, e não faz nada a quem não a tiver
 * dado.
 */

import { getRepository } from "@/lib/data";
import { lerAtivos } from "@/lib/data/leituras";

export interface InvestimentoSemMovimento {
  id: string;
  nome: string;
  quantity: number;
  unitCostCents: number;
  /** A data de compra escrita no bem, quando lá está. */
  purchasedAt: string | null;
}

/**
 * Quais é que estão à espera da sua compra.
 *
 * Fica de fora quem não tem por onde: sem unidades ou sem custo não há
 * movimento nenhum para criar, e uma posição fechada (zero unidades) já não é
 * uma posição.
 */
export async function investimentosSemMovimentos(
  spaceId: string,
): Promise<InvestimentoSemMovimento[]> {
  const [bens, comMovimentos] = await Promise.all([
    lerAtivos(spaceId).catch(() => []),
    getRepository().assetIdsComMovimentos(spaceId).catch(() => null),
  ]);

  // `null` é "não consegui ler", e é diferente de "nenhum tem movimentos".
  // Sem esta distinção, uma falha de leitura convidava a criar segundas
  // compras por cima das que já existem.
  if (comMovimentos === null) return [];
  const temMovimentos = new Set(comMovimentos);

  return bens
    .filter(
      (a) =>
        a.kind === "investimento" &&
        !temMovimentos.has(a.id) &&
        (a.quantity ?? 0) > 0 &&
        (a.unitCostCents ?? 0) > 0,
    )
    .map((a) => ({
      id: a.id,
      nome: a.name,
      quantity: a.quantity as number,
      unitCostCents: a.unitCostCents as number,
      purchasedAt: a.purchasedAt ?? null,
    }));
}
