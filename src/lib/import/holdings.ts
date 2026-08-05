/**
 * Leitura de extratos de corretora (posições).
 *
 * Reaproveita a mesma máquina dos extratos bancários: ficheiro para grelha,
 * deteção do cabeçalho, mapeamento de colunas. Só muda o que se procura, aqui
 * não são movimentos com data e valor, são POSIÇÕES: o que se tem, quantas
 * unidades, a que preço se comprou e quanto vale hoje.
 *
 * Funções puras e testadas. Como nos bancos, quando a deteção falha o
 * utilizador aponta as colunas à mão e a estrutura fica aprendida.
 */

import type { Grid } from "./columns";

export interface HoldingMapping {
  headerRow: number;
  /** Nome ou ticker do ativo. */
  nameCol: number;
  quantityCol: number;
  /** Preço médio de compra por unidade. -1 se o ficheiro não o trouxer. */
  unitCostCol: number;
  /** Preço atual por unidade. -1 se não vier. */
  unitPriceCol: number;
  /** Valor total da posição hoje. Serve para derivar o preço se este faltar. */
  marketValueCol: number;
}

export interface HoldingRow {
  name: string;
  quantity: number;
  unitCostCents: number | null;
  unitPriceCents: number | null;
}

function norm(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NAME_HEADERS = [
  "nome", "designacao", "descricao", "ativo", "instrumento", "titulo", "produto",
  "name", "instrument", "security", "symbol", "ticker", "isin",
];
const QUANTITY_HEADERS = [
  "quantidade", "qtd", "unidades", "n de unidades", "numero de unidades", "posicao",
  "quantity", "qty", "shares", "units", "position",
];
const COST_HEADERS = [
  "preco medio", "custo medio", "preco de compra", "preco aquisicao", "custo unitario",
  "average price", "avg price", "cost basis", "purchase price", "book price",
];
const PRICE_HEADERS = [
  "preco atual", "cotacao", "ultimo preco", "preco de mercado", "preco",
  "last price", "market price", "current price", "price", "close",
];
const VALUE_HEADERS = [
  "valor de mercado", "valor atual", "valor posicao", "valor total", "valor",
  "market value", "value", "total value", "amount",
];

/**
 * Preço e valor confundem-se com facilidade ("valor" pode ser qualquer um), por
 * isso cada coluna recebe UM papel só, por ordem de especificidade.
 */
function headerRole(
  header: string,
): "name" | "quantity" | "cost" | "price" | "value" | null {
  const h = norm(header);
  if (!h) return null;
  const has = (list: string[]) => list.some((k) => h === k || h.includes(k));
  if (has(NAME_HEADERS)) return "name";
  if (has(QUANTITY_HEADERS)) return "quantity";
  // O custo médio antes do preço: "preço médio" também contém "preço".
  if (has(COST_HEADERS)) return "cost";
  if (has(VALUE_HEADERS) && !has(PRICE_HEADERS)) return "value";
  if (has(PRICE_HEADERS)) return "price";
  return null;
}

/** Número de uma célula, aceitando formato europeu e anglo-saxónico. */
export function parseQuantity(raw: string): number | null {
  const s = (raw ?? "").toString().trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  let clean = s;
  if (s.includes(",") && s.includes(".")) {
    clean = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    clean = s.replace(",", ".");
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Cêntimos a partir de uma célula de preço. Null se não for número. */
export function parsePriceCents(raw: string): number | null {
  const n = parseQuantity(raw);
  return n === null ? null : Math.round(n * 100);
}

/** Procura o cabeçalho e o papel de cada coluna. Null se não reconhecer. */
export function detectHoldingMapping(grid: Grid): HoldingMapping | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r] ?? [];
    const mapping: HoldingMapping = {
      headerRow: r,
      nameCol: -1,
      quantityCol: -1,
      unitCostCol: -1,
      unitPriceCol: -1,
      marketValueCol: -1,
    };
    for (let c = 0; c < row.length; c++) {
      switch (headerRole(row[c] ?? "")) {
        case "name":
          if (mapping.nameCol < 0) mapping.nameCol = c;
          break;
        case "quantity":
          if (mapping.quantityCol < 0) mapping.quantityCol = c;
          break;
        case "cost":
          if (mapping.unitCostCol < 0) mapping.unitCostCol = c;
          break;
        case "price":
          if (mapping.unitPriceCol < 0) mapping.unitPriceCol = c;
          break;
        case "value":
          if (mapping.marketValueCol < 0) mapping.marketValueCol = c;
          break;
      }
    }
    // O mínimo útil é saber O QUÊ e QUANTO. Preços podem vir depois, à mão.
    if (mapping.nameCol >= 0 && mapping.quantityCol >= 0) return mapping;
  }
  return null;
}

/** Converte as linhas da grelha em posições, saltando o que não faz sentido. */
export function rowsToHoldings(grid: Grid, mapping: HoldingMapping): HoldingRow[] {
  const out: HoldingRow[] = [];
  const cell = (row: string[], col: number) => (col >= 0 ? (row[col] ?? "") : "");

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = cell(row, mapping.nameCol).toString().trim();
    const quantity = parseQuantity(cell(row, mapping.quantityCol));
    // Linhas de total, separadores e linhas vazias caem aqui.
    if (!name || quantity === null || quantity === 0) continue;

    let unitPriceCents = parsePriceCents(cell(row, mapping.unitPriceCol));
    // Sem preço unitário mas com valor de mercado, o preço deduz-se.
    if (unitPriceCents === null && mapping.marketValueCol >= 0) {
      const value = parsePriceCents(cell(row, mapping.marketValueCol));
      if (value !== null && quantity !== 0) unitPriceCents = Math.round(value / quantity);
    }

    out.push({
      name: name.slice(0, 120),
      quantity,
      unitCostCents: parsePriceCents(cell(row, mapping.unitCostCol)),
      unitPriceCents,
    });
  }
  return out;
}

/** Descrição legível do mapeamento, para o utilizador confirmar. */
export function describeHoldingMapping(grid: Grid, mapping: HoldingMapping): string {
  const header = grid[mapping.headerRow];
  const label = (i: number) => (i >= 0 ? (header?.[i] ?? `coluna ${i + 1}`) : "não encontrado");
  return [
    `ativo: ${label(mapping.nameCol)}`,
    `quantidade: ${label(mapping.quantityCol)}`,
    `custo: ${label(mapping.unitCostCol)}`,
    `preço: ${label(mapping.unitPriceCol)}`,
  ].join(" · ");
}
