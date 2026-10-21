/**
 * Leitura de ficheiros de **movimentos** de corretora.
 *
 * Não confundir com `holdings.ts`, que lê posições. São ficheiros diferentes a
 * responder a perguntas diferentes, e importar um pelo outro dá disparates:
 * um extrato de transações tem uma linha por operação, com data, e as vendas
 * vêm com quantidade negativa. Lido como se fossem posições, aparecem "147
 * posições" das quais algumas com -4 unidades, que não quer dizer nada.
 *
 * Um ficheiro destes vale muito mais do que uma lista de posições: traz as
 * datas, e são as datas que permitem saber o que o dinheiro rendeu.
 *
 * Como nos bancos: deteção automática, e quem manda é sempre o utilizador, que
 * pode apontar as colunas à mão e ver o resultado antes de gravar.
 */

import {
  detectDecimalSeparator,
  parseAmountCents,
  parseDate,
  type Grid,
} from "./columns";

export interface TradeMapping {
  headerRow: number;
  dateCol: number;
  /** Nome do produto ou ticker. */
  nameCol: number;
  quantityCol: number;
  /** Preço por unidade. -1 se não vier. */
  priceCol: number;
  /** Valor total da operação. -1 se não vier. */
  amountCol: number;
  /** Moeda da operação. -1 se não vier. */
  currencyCol: number;
  /** Taxa de câmbio aplicada. -1 se não vier. */
  fxRateCol: number;
  /** Coluna que diz "compra" ou "venda". -1 quando o sinal da quantidade chega. */
  kindCol: number;
  /** A bolsa onde o negócio foi feito. -1 se não vier. */
  exchangeCol?: number;
}

export type ImportedTradeKind = "compra" | "venda" | "dividendo" | "custo";

export interface TradeRow {
  /** "AAAA-MM-DD". */
  date: string;
  name: string;
  kind: ImportedTradeKind;
  /** Unidades, sempre em positivo. O sentido está no `kind`. */
  quantity: number;
  unitPriceCents: number | null;
  /** Valor da operação na moeda da linha, sempre positivo. */
  amountCents: number | null;
  /** Moeda da linha, quando não é euro. */
  currency: string | null;
  fxRate: number | null;
  /**
   * A bolsa onde o negócio foi feito, como o ficheiro a escreve ("NDQ", "EAM").
   *
   * É a pista mais fiável que existe para o símbolo: diz a praça sem se ter de
   * a adivinhar a partir do nome do produto. Duas empresas com nomes parecidos
   * em países diferentes são a forma mais fácil de acertar no ticker errado, e
   * esta coluna resolve isso de graça.
   */
  exchange: string | null;
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

const DATE_HEADERS = [
  "data", "data da transacao", "data valor", "data de execucao", "data negociacao",
  "date", "trade date", "settlement date", "transaction date", "time",
];
const NAME_HEADERS = [
  "produto", "ativo", "titulo", "instrumento", "descricao", "designacao", "nome",
  "product", "name", "instrument", "security", "symbol", "ticker", "isin", "description",
];
const QUANTITY_HEADERS = [
  "quantidade", "qtd", "unidades", "numero de titulos", "n de unidades",
  "quantity", "qty", "shares", "units", "no of shares", "number of shares",
];
const PRICE_HEADERS = [
  "precos", "preco", "preco unitario", "cotacao", "preco por unidade",
  "price", "unit price", "share price", "price per share", "execution price",
];
const AMOUNT_HEADERS = [
  "valor local", "valor", "montante", "total", "valor total", "montante total",
  "amount", "value", "total amount", "gross amount", "consideration",
];
const CURRENCY_HEADERS = ["moeda", "divisa", "currency", "ccy"];
const FX_HEADERS = ["taxa de cambio", "cambio", "taxa cambial", "exchange rate", "fx rate", "rate"];
/**
 * A coluna da bolsa. A Degiro chama-lhe "Bolsa"; outros chamam-lhe "Venue",
 * "Market" ou "Exchange".
 */
const EXCHANGE_HEADERS = [
  "bolsa", "praca", "mercado", "centro de execucao",
  "exchange", "venue", "market", "trading venue", "mic",
];
const KIND_HEADERS = [
  "tipo", "operacao", "tipo de operacao", "sentido", "natureza",
  "type", "side", "action", "transaction type", "buy sell", "direction",
];

function findCol(header: string[], candidates: string[]): number {
  const cells = header.map(norm);
  // Correspondência exata primeiro: "valor" não deve apanhar "valor em divisa".
  for (const c of candidates) {
    const i = cells.indexOf(c);
    if (i !== -1) return i;
  }
  for (const c of candidates) {
    const i = cells.findIndex((cell) => cell.includes(c));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * A coluna da moeda, que muitas vezes não tem cabeçalho nenhum.
 *
 * É assim na Degiro e não só: a moeda aparece numa coluna sem nome logo a
 * seguir ao valor, porque no ecrã da corretora ela é lida como parte do número.
 * Procurar só por um cabeçalho chamado "moeda" deixa esses ficheiros a perder
 * o câmbio todo, e uma compra em dólares importada como se fosse em euros fica
 * com o valor errado sem ninguém dar por isso.
 *
 * Por isso: se não houver cabeçalho, procura-se uma coluna cujas células sejam
 * códigos de três letras, e prefere-se a que está imediatamente à direita do
 * valor.
 */
function detectCurrencyCol(grid: Grid, headerRow: number, header: string[], amountCol: number): number {
  const named = findCol(header, CURRENCY_HEADERS);
  if (named !== -1) return named;

  const body = grid.slice(headerRow + 1, headerRow + 12);
  const width = Math.max(header.length, ...body.map((r) => r?.length ?? 0));

  const looksLikeCurrency = (col: number): boolean => {
    const cells = body.map((r) => (r?.[col] ?? "").toString().trim()).filter((c) => c !== "");
    if (cells.length === 0) return false;
    return cells.every((c) => /^[A-Za-z]{3}$/.test(c));
  };

  // À direita do valor é onde ela costuma estar.
  if (amountCol >= 0 && looksLikeCurrency(amountCol + 1)) return amountCol + 1;
  for (let c = 0; c < width; c++) {
    if (c !== amountCol && looksLikeCurrency(c)) return c;
  }
  return -1;
}

/** A linha do cabeçalho: a primeira em que se veem data, produto e quantidade. */
export function detectTradeMapping(grid: Grid): TradeMapping | null {
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const header = grid[r] ?? [];
    if (header.filter((c) => (c ?? "").trim() !== "").length < 3) continue;

    const dateCol = findCol(header, DATE_HEADERS);
    const nameCol = findCol(header, NAME_HEADERS);
    const quantityCol = findCol(header, QUANTITY_HEADERS);
    if (dateCol === -1 || nameCol === -1 || quantityCol === -1) continue;

    // As linhas abaixo têm mesmo datas? Um cabeçalho certo com corpo errado é
    // pior do que não detetar nada.
    const hasDates = grid
      .slice(r + 1, r + 8)
      .some((row) => parseDate(row?.[dateCol] ?? "") !== null);
    if (!hasDates) continue;

    return {
      headerRow: r,
      dateCol,
      nameCol,
      quantityCol,
      priceCol: findCol(header, PRICE_HEADERS),
      amountCol: findCol(header, AMOUNT_HEADERS),
      currencyCol: detectCurrencyCol(grid, r, header, findCol(header, AMOUNT_HEADERS)),
      fxRateCol: findCol(header, FX_HEADERS),
      kindCol: findCol(header, KIND_HEADERS),
      exchangeCol: findCol(header, EXCHANGE_HEADERS),
    };
  }
  return null;
}

const SELL_WORDS = ["venda", "vender", "sell", "sale", "s"];
const BUY_WORDS = ["compra", "comprar", "buy", "purchase", "b"];
const DIVIDEND_WORDS = ["dividendo", "dividend", "distribuicao", "cupao", "coupon"];
const COST_WORDS = ["comissao", "custo", "taxa", "imposto", "fee", "commission", "tax", "charge"];

/**
 * Que tipo de movimento é a linha.
 *
 * A coluna de tipo, quando existe, manda: é o que a corretora diz. Sem ela, o
 * sinal da quantidade decide, que é a convenção de toda a gente.
 */
export function tradeKindOf(kindCell: string, quantity: number): ImportedTradeKind {
  const k = norm(kindCell);
  if (k) {
    if (DIVIDEND_WORDS.some((w) => k.includes(w))) return "dividendo";
    if (COST_WORDS.some((w) => k.includes(w))) return "custo";
    if (SELL_WORDS.some((w) => k === w || k.startsWith(`${w} `))) return "venda";
    if (BUY_WORDS.some((w) => k === w || k.startsWith(`${w} `))) return "compra";
  }
  return quantity < 0 ? "venda" : "compra";
}

/**
 * Uma taxa de câmbio, que não se lê com o leitor dos valores monetários.
 *
 * "1,0912" tem quatro casas decimais, e o leitor de dinheiro vê aí um separador
 * de milhares (porque em euros ninguém escreve quatro casas) e devolve 10912.
 * Uma taxa nunca tem separador de milhares: o que estiver depois da vírgula ou
 * do ponto é decimal, sempre.
 */
export function parseRate(raw: string): number | null {
  const s = (raw ?? "").toString().trim().replace(/\s/g, "").replace(",", ".");
  if (!s || !/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Uma moeda de três letras, se a célula tiver uma. */
function currencyOf(cell: string): string | null {
  const m = (cell ?? "").toString().trim().toUpperCase().match(/\b([A-Z]{3})\b/);
  if (!m) return null;
  return m[1] === "EUR" ? null : m[1]!;
}

export function rowsToTrades(grid: Grid, mapping: TradeMapping): TradeRow[] {
  const out: TradeRow[] = [];

  /**
   * Que separador decimal é que este ficheiro usa, coluna a coluna.
   *
   * Sozinho, "493.975" é ambíguo — e a regra portuguesa lê-o como 493 975. Num
   * ficheiro que escreve os decimais com ponto, isso transforma uma compra de
   * 493,98 € numa de 493 975,00 €, com o "500.00" da linha ao lado a ser lido
   * bem. Aconteceu. A coluna inteira desfaz a ambiguidade que um número
   * sozinho não desfaz.
   */
  const daColuna = (col: number): string[] => {
    if (col < 0) return [];
    const vs: string[] = [];
    for (let r = mapping.headerRow + 1; r < grid.length; r++) {
      const c = grid[r]?.[col];
      if (c) vs.push(String(c));
    }
    return vs;
  };
  const sepValor = detectDecimalSeparator([
    ...daColuna(mapping.amountCol),
    ...daColuna(mapping.priceCol),
  ]);
  const sepQtd = detectDecimalSeparator(daColuna(mapping.quantityCol));

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const date = parseDate(row[mapping.dateCol] ?? "");
    if (!date) continue;

    const name = (row[mapping.nameCol] ?? "").toString().trim();
    if (!name) continue;

    const rawQty = parseAmountCents(row[mapping.quantityCol] ?? "", sepQtd);
    // A quantidade passa pelo mesmo leitor dos valores (aguenta "1.234,56"),
    // por isso vem em cêntimos e divide-se de volta.
    const quantity = rawQty === null ? 0 : rawQty / 100;

    const kind = tradeKindOf(
      mapping.kindCol >= 0 ? (row[mapping.kindCol] ?? "") : "",
      quantity,
    );

    const unitPriceCents =
      mapping.priceCol >= 0 ? parseAmountCents(row[mapping.priceCol] ?? "", sepValor) : null;
    const amountCents =
      mapping.amountCol >= 0 ? parseAmountCents(row[mapping.amountCol] ?? "", sepValor) : null;

    // Uma linha sem quantidade e sem valor não é movimento nenhum.
    if (quantity === 0 && (amountCents === null || amountCents === 0)) continue;

    const currency =
      mapping.currencyCol >= 0 ? currencyOf(row[mapping.currencyCol] ?? "") : null;
    const fxRate = mapping.fxRateCol >= 0 ? parseRate(row[mapping.fxRateCol] ?? "") : null;
    const exchangeCol = mapping.exchangeCol ?? -1;
    const exchange =
      exchangeCol >= 0
        ? (row[exchangeCol] ?? "").toString().trim().slice(0, 24) || null
        : null;

    out.push({
      date,
      name: name.slice(0, 120),
      kind,
      quantity: Math.abs(quantity),
      unitPriceCents: unitPriceCents === null ? null : Math.abs(unitPriceCents),
      amountCents: amountCents === null ? null : Math.abs(amountCents),
      currency,
      fxRate,
      exchange,
    });
  }

  return out;
}

export function describeTradeMapping(grid: Grid, mapping: TradeMapping): string {
  const header = grid[mapping.headerRow] ?? [];
  const at = (i: number) => (i >= 0 ? (header[i] ?? `coluna ${i + 1}`) : "não encontrado");
  const parts = [
    `data: ${at(mapping.dateCol)}`,
    `ativo: ${at(mapping.nameCol)}`,
    `quantidade: ${at(mapping.quantityCol)}`,
    `preço: ${at(mapping.priceCol)}`,
    `valor: ${at(mapping.amountCol)}`,
  ];
  if (mapping.currencyCol >= 0) parts.push(`moeda: ${at(mapping.currencyCol)}`);
  if (mapping.fxRateCol >= 0) parts.push(`câmbio: ${at(mapping.fxRateCol)}`);
  if (mapping.kindCol >= 0) parts.push(`tipo: ${at(mapping.kindCol)}`);
  return parts.join(" · ");
}

/**
 * A assinatura de um movimento: o que o torna igual a outro.
 *
 * O nome não entra porque a comparação é sempre dentro do mesmo ativo.
 */
export function tradeKey(t: {
  date: string;
  kind: string;
  quantity: number;
  amountCents: number | null;
}): string {
  return [t.date, t.kind, t.quantity, t.amountCents ?? 0].join("|");
}

/**
 * Só os movimentos que ainda não estão lá dentro.
 *
 * Isto **não** é o dedup normal por chave única, e a diferença importa. Duas
 * compras iguais, do mesmo produto, no mesmo dia, ao mesmo preço, acontecem a
 * sério: as corretoras partem uma ordem grande em várias execuções, e um
 * ficheiro da Degiro traz essas linhas repetidas de propósito. Uma chave única
 * por conteúdo apagava as repetições legítimas e deixava a posição errada.
 *
 * Por isso conta-se: se o ficheiro traz três linhas iguais e já lá estão duas,
 * importa-se uma. Reimportar o mesmo ficheiro não acrescenta nada, e um ficheiro
 * com uma execução a mais acrescenta só essa.
 */
export function newTradesOnly<T extends { date: string; kind: string; quantity: number; amountCents: number | null }>(
  incoming: T[],
  existing: { date: string; kind: string; quantity: number; amountCents: number | null }[],
): { fresh: T[]; duplicates: number } {
  const seen = new Map<string, number>();
  for (const e of existing) {
    const k = tradeKey(e);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }

  const fresh: T[] = [];
  let duplicates = 0;
  for (const t of incoming) {
    const k = tradeKey(t);
    const left = seen.get(k) ?? 0;
    if (left > 0) {
      seen.set(k, left - 1);
      duplicates++;
    } else {
      fresh.push(t);
    }
  }
  return { fresh, duplicates };
}

/**
 * Agrupa os movimentos por produto, que é como eles vão dar origem a ativos.
 *
 * Um ficheiro de 147 linhas costuma ser uma dúzia de produtos. Mostrar a lista
 * agrupada é a diferença entre conseguir rever a importação e não conseguir.
 */
export function groupTradesByName(rows: TradeRow[]): { name: string; trades: TradeRow[] }[] {
  const byName = new Map<string, TradeRow[]>();
  for (const t of rows) {
    byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  }
  return [...byName.entries()]
    .map(([name, trades]) => ({ name, trades }))
    .sort((a, b) => b.trades.length - a.trades.length || a.name.localeCompare(b.name));
}
