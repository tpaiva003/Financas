/**
 * O valor de um imóvel, a acompanhar o índice da zona.
 *
 * **O que se sabe e o que se estima.** De uma casa sabe-se o que se pagou por
 * ela e o que se meteu em obras. O valor de hoje não se sabe — estima-se
 * aplicando ao custo a valorização que o INE publica para aquele sítio desde a
 * data da escritura.
 *
 * **Calcula-se a cada visita, não se grava.** Gravar o valor no bem deixava-o
 * parado até alguém voltar a abrir o formulário, que é exatamente o problema
 * que isto veio resolver — um imóvel avaliado ao preço de 2019 com ar de atual.
 * O pedido ao INE é um só por servidor a cada doze horas.
 *
 * **Um valor escrito à mão ganha sempre.** Quem conhece a casa sabe mais do que
 * a mediana do concelho: se estiver lá um valor, é esse que conta e esta conta
 * fica só como segunda opinião.
 */

import type { Asset } from "@/lib/data";
import {
  custoTotalImovel,
  precoNaData,
  valorImovelPeloIndice,
  type ValorImovel,
} from "@/lib/domain";
import { getInePriceTable } from "./ine-service";

/**
 * Estima o valor de cada imóvel que tenha custo, data e sítio.
 *
 * Devolve um mapa por id. Os que não têm dados que cheguem ficam de fora — e
 * quem chama mantém o valor escrito à mão, em vez de os pôr a zero.
 */
export async function estimarValoresDeImoveis(
  assets: readonly Asset[],
  hoje: string,
): Promise<Map<string, ValorImovel>> {
  const porId = new Map<string, ValorImovel>();

  const candidatos = assets.filter(
    (a) =>
      a.kind === "imovel" &&
      typeof a.purchasePriceCents === "number" &&
      a.purchasePriceCents > 0 &&
      Boolean(a.priceRefGeocod) &&
      Boolean(a.purchasedAt),
  );
  if (candidatos.length === 0) return porId;

  const { table } = await getInePriceTable().catch(() => ({ table: null }));
  if (!table) return porId;

  for (const a of candidatos) {
    const v = valorImovelPeloIndice({
      custoCents: custoTotalImovel({
        purchasePriceCents: a.purchasePriceCents,
        worksCents: a.worksCents,
      }),
      indiceCompra: precoNaData(table.periodos, String(a.priceRefGeocod), String(a.purchasedAt)),
      indiceHoje: precoNaData(table.periodos, String(a.priceRefGeocod), hoje),
    });
    if (v) porId.set(a.id, v);
  }

  return porId;
}
