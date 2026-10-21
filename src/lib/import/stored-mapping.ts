/**
 * Ler um mapeamento guardado, sem acreditar nele.
 *
 * Os formatos aprendidos são guardados quando alguém confirma que a importação
 * saiu certa, e daí em diante **ganham à deteção automática**. Isso é bom: foram
 * validados por uma pessoa. O problema é que estavam a ser usados assim:
 *
 * ```ts
 * mapping = tpl.mapping as unknown as TradeMapping;
 * ```
 *
 * Um `as unknown as` não verifica nada. Um template gravado por uma versão mais
 * antiga da app não tem os campos que a app entretanto passou a ler, e um campo
 * em falta chega ao código como `undefined`. Como `undefined >= 0` é `false`,
 * uma coluna em falta não dá erro nenhum — passa por "esta coluna não existe no
 * ficheiro". Para a moeda e para o câmbio isso é grave: desliga-os em silêncio,
 * e uma compra em dólares passa a ser gravada como se fossem euros. É
 * exatamente o que o invariante "sem taxa de câmbio não se grava preço nenhum"
 * existe para impedir.
 *
 * Por isso: um template só vale se trouxer **todos** os campos, todos números
 * inteiros, e com os índices dentro da grelha do ficheiro que está a ser lido.
 * Se faltar alguma coisa, devolve-se `null` e volta-se à deteção — que é a
 * resposta certa para "template velho".
 */

import type { Grid } from "./columns";
import type { TradeMapping } from "./trades";
import type { HoldingMapping } from "./holdings";

/** A largura da grelha: nenhum índice pode apontar para fora dela. */
export function gridWidth(grid: Grid): number {
  return Math.max(0, ...grid.map((r) => (r ?? []).length));
}

type Guardado = Record<string, number | boolean> | null | undefined;

/**
 * Um índice de coluna guardado.
 *
 * `-1` é uma resposta legítima e quer dizer "o ficheiro não tem esta coluna".
 * O que não é legítimo é o campo faltar: isso é um template de outra versão.
 */
function indice(raw: Guardado, campo: string, width: number): number | null {
  const v = raw?.[campo];
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < -1 || v >= width) return null;
  return v;
}

/** Igual, mas para os campos obrigatórios, onde `-1` também não serve. */
function indiceObrigatorio(raw: Guardado, campo: string, width: number): number | null {
  const v = indice(raw, campo, width);
  return v === null || v < 0 ? null : v;
}

/** Um mapeamento de movimentos guardado, ou `null` se não for de confiança. */
export function storedTradeMapping(raw: Guardado, grid: Grid): TradeMapping | null {
  if (!raw) return null;
  const width = gridWidth(grid);

  const headerRow = raw.headerRow;
  if (typeof headerRow !== "number" || !Number.isInteger(headerRow)) return null;
  if (headerRow < 0 || headerRow >= grid.length) return null;

  // Sem estas três não há movimento nenhum: não se sabe quando, o quê, nem quanto.
  const dateCol = indiceObrigatorio(raw, "dateCol", width);
  const nameCol = indiceObrigatorio(raw, "nameCol", width);
  const quantityCol = indiceObrigatorio(raw, "quantityCol", width);
  if (dateCol === null || nameCol === null || quantityCol === null) return null;

  // Estas podem valer -1, mas TÊM de vir. Em falta = template velho.
  const priceCol = indice(raw, "priceCol", width);
  const amountCol = indice(raw, "amountCol", width);
  const currencyCol = indice(raw, "currencyCol", width);
  const fxRateCol = indice(raw, "fxRateCol", width);
  const kindCol = indice(raw, "kindCol", width);
  if (
    priceCol === null ||
    amountCol === null ||
    currencyCol === null ||
    fxRateCol === null ||
    kindCol === null
  ) {
    return null;
  }

  return {
    headerRow,
    dateCol,
    nameCol,
    quantityCol,
    priceCol,
    amountCol,
    currencyCol,
    fxRateCol,
    kindCol,
  };
}

/** O mesmo para uma lista de posições, onde não há datas. */
export function storedHoldingMapping(raw: Guardado, grid: Grid): HoldingMapping | null {
  if (!raw) return null;
  // Um mapeamento de movimentos tem data; um de posições não. Se traz `dateCol`,
  // não é isto que estamos a ler.
  if (typeof raw.dateCol === "number") return null;
  const width = gridWidth(grid);

  const headerRow = raw.headerRow;
  if (typeof headerRow !== "number" || !Number.isInteger(headerRow)) return null;
  if (headerRow < 0 || headerRow >= grid.length) return null;

  const nameCol = indiceObrigatorio(raw, "nameCol", width);
  const quantityCol = indiceObrigatorio(raw, "quantityCol", width);
  if (nameCol === null || quantityCol === null) return null;

  const unitCostCol = indice(raw, "unitCostCol", width);
  const unitPriceCol = indice(raw, "unitPriceCol", width);
  const marketValueCol = indice(raw, "marketValueCol", width);
  if (unitCostCol === null || unitPriceCol === null || marketValueCol === null) return null;

  return { headerRow, nameCol, quantityCol, unitCostCol, unitPriceCol, marketValueCol };
}
