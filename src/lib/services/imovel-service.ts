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
 * O que a página do património está disposta a esperar pelo INE.
 *
 * O valor ao preço da zona aparece **ao lado** do valor registado e nunca por
 * cima. Não chegar a tempo não parte nada: o imóvel mostra o que tem registado,
 * que é o que já mostrava antes de isto existir.
 *
 * Um segundo chega: com o `revalidate` no fetch do INE, o caminho normal é a
 * Data Cache e nem toca na rede — o tecto só se paga no primeiro pedido de
 * cada meio dia.
 */
const TIMEOUT_NA_PAGINA_MS = 1_000;

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

  // Tecto curto: isto corre no meio do desenho de uma página e ninguém pediu
  // para esperar. Ver `getInePriceTable`.
  const { table } = await getInePriceTable({ timeoutMs: TIMEOUT_NA_PAGINA_MS }).catch(() => ({
    table: null,
  }));
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

/**
 * O índice da zona de cada imóvel, mês a mês, para reconstruir o passado.
 *
 * **Reconstrução a sério, não uma projeção do valor de hoje.** O que a casa
 * custou é um facto com data, e o índice do concelho é uma série pública
 * trimestral. Com os dois, o valor de um mês passado é uma conta — a mesma que
 * a app já faz para hoje, avaliada noutra data.
 *
 * Usar a mesma fórmula dos dois lados é o que faz a linha não dar um salto na
 * costura entre o reconstruído e o medido.
 */
export async function indicesDeImoveis(
  assets: readonly Asset[],
  datas: readonly string[],
): Promise<Map<string, { custoCents: number; indiceCompraCents: number; indicePorData: Record<string, number> }>> {
  const porId = new Map<
    string,
    { custoCents: number; indiceCompraCents: number; indicePorData: Record<string, number> }
  >();

  const candidatos = assets.filter(
    (a) =>
      a.kind === "imovel" &&
      typeof a.purchasePriceCents === "number" &&
      a.purchasePriceCents > 0 &&
      Boolean(a.priceRefGeocod) &&
      Boolean(a.purchasedAt),
  );
  if (candidatos.length === 0 || datas.length === 0) return porId;

  // Tecto curto: isto corre no meio do desenho de uma página e ninguém pediu
  // para esperar. Ver `getInePriceTable`.
  const { table } = await getInePriceTable({ timeoutMs: TIMEOUT_NA_PAGINA_MS }).catch(() => ({
    table: null,
  }));
  if (!table) return porId;

  for (const a of candidatos) {
    const custoCents = custoTotalImovel({
      purchasePriceCents: a.purchasePriceCents,
      worksCents: a.worksCents,
    });
    const compra = precoNaData(table.periodos, String(a.priceRefGeocod), String(a.purchasedAt));
    if (custoCents === null || !compra || compra.cents <= 0) continue;

    const indicePorData: Record<string, number> = {};
    for (const d of datas) {
      // Antes da escritura a casa não era desta pessoa: não se inventa índice
      // nenhum, e o mês fica de fora.
      if (d < String(a.purchasedAt)) continue;
      const p = precoNaData(table.periodos, String(a.priceRefGeocod), d);
      if (p && p.cents > 0) indicePorData[d] = p.cents;
    }
    porId.set(a.id, { custoCents, indiceCompraCents: compra.cents, indicePorData });
  }

  return porId;
}
