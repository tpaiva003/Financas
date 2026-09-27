/**
 * Deteção e mapeamento de colunas de extratos bancários (REQ-IMP-1/2).
 *
 * Os bancos exportam colunas com nomes diferentes e, por vezes, com linhas de
 * cabeçalho antes da tabela. Estas funções são PURAS e testadas: encontram a
 * linha de cabeçalho, adivinham que coluna é a data/descrição/valor e convertem
 * cada linha numa transação normalizada.
 *
 * O utilizador pode sempre corrigir o mapeamento na UI, por isso a deteção só
 * precisa de acertar na maioria dos casos, não em todos.
 */

import type { NormalizedTransaction } from "@/lib/domain";

export type Grid = string[][];

export interface ColumnMapping {
  /** Índice da linha de cabeçalho no ficheiro. */
  headerRow: number;
  dateCol: number;
  descriptionCol: number;
  /** Coluna de valor único (com sinal). -1 se usar débito/crédito separados. */
  amountCol: number;
  /** Colunas separadas de débito (gasto) e crédito (entrada). -1 se não aplicável. */
  debitCol: number;
  creditCol: number;
  /**
   * Em extratos com coluna única, os gastos costumam vir negativos. Quando
   * `invertSign` é true, multiplicamos por -1 para que gasto fique positivo
   * (a app trata gasto como valor positivo e reembolso como negativo).
   */
  invertSign: boolean;
}

const DATE_HEADERS = [
  "data movimento", "data de movimento", "data mov", "data valor", "data da operacao",
  "data operacao", "data", "launch date", "value date", "booking date", "date",
];
const DESC_HEADERS = [
  "descricao", "descritivo", "movimento", "historico", "detalhe", "detalhes",
  "description", "conceito", "concept", "details",
];
const AMOUNT_HEADERS = [
  "montante", "importancia", "valor eur", "valor", "amount", "value", "importe",
];
const DEBIT_HEADERS = ["debito", "debit", "saida", "levantamento", "withdrawal"];
const CREDIT_HEADERS = ["credito", "credit", "entrada", "deposito", "deposit"];
/**
 * Colunas numéricas que NUNCA são o valor da transação. O saldo é numérico e
 * apareceria como candidato, mas importá-lo daria valores completamente errados.
 */
const NEVER_AMOUNT_HEADERS = ["saldo", "balance", "saldo contabilistico", "saldo disponivel"];

function norm(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Uma célula parece uma data (dd/mm/aaaa, aaaa-mm-dd, dd-mm-aa…)? */
export function looksLikeDate(cell: string): boolean {
  return parseDate(cell) !== null;
}

/**
 * Converte texto de data para ISO (aaaa-mm-dd). Aceita os formatos comuns em
 * extratos portugueses. Devolve null se não reconhecer.
 */
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;

  // ISO: 2026-07-02 (ou com hora)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(+iso[1]!, +iso[2]!, +iso[3]!);

  // dd/mm/aaaa, dd-mm-aaaa, dd.mm.aa
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    let year = +dmy[3]!;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return validDate(year, +dmy[2]!, +dmy[1]!);
  }

  return null;
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Qual dos dois sinais é o separador decimal num ficheiro. */
export type SeparadorDecimal = "." | ",";

/**
 * Que separador decimal é que ESTA coluna usa.
 *
 * **O problema que isto resolve, e custou dinheiro.** Sozinho, "493.975" é
 * ambíguo: tanto pode ser quatrocentos e noventa e três mil como quatrocentos e
 * noventa e três vírgula novecentos e setenta e cinco. A regra de "três dígitos
 * depois do ponto são milhares" é a certa em português — e é a errada num
 * ficheiro que escreve os decimais com ponto e às vezes usa três casas. Numa
 * importação real, uma compra de 493,98 € entrou como **493 975,00 €**, com o
 * resto da coluna ("500.00", "555.36") a ser lido corretamente ao lado.
 *
 * **A coluna inteira desfaz a ambiguidade.** Se houver um único "500.00" na
 * coluna, então neste ficheiro o ponto é decimal — e "493.975" tem de ser
 * 493,975. Um número sozinho não chega para decidir; a coluna chega.
 *
 * Devolve `null` quando a coluna não diz nada de útil (só inteiros, ou os dois
 * sinais usados como decimais), e nesse caso vale a regra de sempre.
 */
export function detectDecimalSeparator(valores: readonly string[]): SeparadorDecimal | null {
  let ponto = 0;
  let virgula = 0;

  for (const bruto of valores) {
    const s = (bruto ?? "").toString().trim().replace(/[€$£\s ]/g, "");
    if (!s || !/\d/.test(s)) continue;

    const c = s.lastIndexOf(",");
    const d = s.lastIndexOf(".");

    // Com os dois sinais não há ambiguidade nenhuma: o da direita é o decimal.
    if (c >= 0 && d >= 0) {
      if (c > d) virgula++;
      else ponto++;
      continue;
    }
    // Com um só sinal, 1 ou 2 casas atrás dele é sempre decimal: ninguém
    // escreve milhares em grupos de dois.
    const casasC = c >= 0 ? s.length - c - 1 : -1;
    const casasD = d >= 0 ? s.length - d - 1 : -1;
    if (casasC === 1 || casasC === 2) virgula++;
    if (casasD === 1 || casasD === 2) ponto++;
  }

  if (ponto > 0 && virgula === 0) return ".";
  if (virgula > 0 && ponto === 0) return ",";
  return null;
}

/**
 * Converte texto monetário europeu em cêntimos. Aceita "1.234,56", "1234,56",
 * "-45,20", "45.20", "1 234,56 €" e parêntesis para negativo ("(45,20)").
 * Devolve null se não for número.
 *
 * `separador` vem do `detectDecimalSeparator` e resolve a ambiguidade de um
 * número sozinho — ver lá o porquê. Sem ele, vale a regra de sempre.
 */
export function parseAmountCents(raw: string, separador?: SeparadorDecimal | null): number | null {
  let s = (raw ?? "").toString().trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€$£\s ]/g, "");
  // Código de moeda colado ao número, como em "-156,00EUR".
  s = s.replace(/(eur|usd|gbp|brl)$/i, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!s || !/[\d]/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  // A coluna já disse qual é o decimal: o outro sinal só pode ser milhares.
  if (separador === ".") {
    s = s.replace(/,/g, "");
  } else if (separador === ",") {
    s = s.replace(/\./g, "");
    const c = s.lastIndexOf(",");
    if (c >= 0) s = `${s.slice(0, c)}.${s.slice(c + 1)}`;
  } else if (lastComma >= 0 && lastDot >= 0) {
    // O separador decimal é o que aparece mais à direita.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Só vírgulas: decimal se sobrarem 1-2 dígitos, senão são milhares.
    const after = s.length - lastComma - 1;
    s = after > 0 && after <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    if (after === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

function matchHeader(cell: string, candidates: string[]): boolean {
  const n = norm(cell);
  if (!n) return false;
  return candidates.some((c) => n === c || n.startsWith(`${c} `) || n.includes(c));
}

type Role = "date" | "debit" | "credit" | "amount" | "description";

/**
 * Papel de UMA célula de cabeçalho, por ordem de prioridade. A ordem importa:
 * "Data Valor" tem de ser data e nunca valor, senão importaríamos a data como
 * montante. O saldo é excluído explicitamente.
 */
function headerRole(cell: string): Role | null {
  const n = norm(cell);
  if (!n) return null;
  if (NEVER_AMOUNT_HEADERS.some((c) => n === c || n.startsWith(`${c} `))) return null;
  if (matchHeader(cell, DATE_HEADERS)) return "date";
  if (matchHeader(cell, DEBIT_HEADERS)) return "debit";
  if (matchHeader(cell, CREDIT_HEADERS)) return "credit";
  if (matchHeader(cell, AMOUNT_HEADERS)) return "amount";
  if (matchHeader(cell, DESC_HEADERS)) return "description";
  return null;
}

/**
 * Deteta a linha de cabeçalho e o papel de cada coluna. Procura o cabeçalho nas
 * primeiras linhas (os extratos costumam ter títulos/saldos antes da tabela).
 */
export function detectMapping(grid: Grid): ColumnMapping | null {
  const limit = Math.min(grid.length, 25);

  for (let r = 0; r < limit; r++) {
    const row = grid[r] ?? [];
    let dateCol = -1;
    let descriptionCol = -1;
    let amountCol = -1;
    let debitCol = -1;
    let creditCol = -1;

    // Cada coluna tem um só papel; fica a primeira coluna de cada papel.
    row.forEach((cell, i) => {
      switch (headerRole(cell)) {
        case "date":
          if (dateCol < 0) dateCol = i;
          break;
        case "debit":
          if (debitCol < 0) debitCol = i;
          break;
        case "credit":
          if (creditCol < 0) creditCol = i;
          break;
        case "amount":
          if (amountCol < 0) amountCol = i;
          break;
        case "description":
          if (descriptionCol < 0) descriptionCol = i;
          break;
      }
    });

    const hasAmount = amountCol >= 0 || debitCol >= 0 || creditCol >= 0;
    if (dateCol >= 0 && descriptionCol >= 0 && hasAmount) {
      return {
        headerRow: r,
        dateCol,
        descriptionCol,
        amountCol: debitCol >= 0 || creditCol >= 0 ? -1 : amountCol,
        debitCol,
        creditCol,
        // Coluna única: gastos costumam vir negativos, logo invertemos.
        invertSign: debitCol < 0 && creditCol < 0 ? guessInvertSign(grid, r, amountCol) : false,
      };
    }
  }

  return detectByContent(grid);
}

/**
 * Há valores negativos na coluna? Então o extrato usa sinal (gasto negativo,
 * entrada positiva) e temos de inverter para a convenção da app. Se for tudo
 * positivo, a coluna já lista gastos e não se inverte nada.
 */
function guessInvertSign(grid: Grid, headerRow: number, amountCol: number): boolean {
  if (amountCol < 0) return false;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cents = parseAmountCents(grid[r]?.[amountCol] ?? "");
    if (cents !== null && cents < 0) return true;
  }
  return false;
}

/**
 * Sem cabeçalho reconhecível: adivinha pelas próprias células (primeira coluna
 * que parece data, a de texto mais longo como descrição, a numérica como valor).
 */
function detectByContent(grid: Grid): ColumnMapping | null {
  const sample = grid.slice(0, 40).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (sample.length === 0) return null;

  const width = Math.max(...sample.map((r) => r.length));
  const dateScore = new Array(width).fill(0);
  const numScore = new Array(width).fill(0);
  const textLen = new Array(width).fill(0);

  for (const row of sample) {
    for (let c = 0; c < width; c++) {
      const cell = (row[c] ?? "").toString();
      if (looksLikeDate(cell)) dateScore[c]++;
      else if (parseAmountCents(cell) !== null) numScore[c]++;
      else textLen[c] += cell.trim().length;
    }
  }

  const dateCol = dateScore.indexOf(Math.max(...dateScore));
  if (dateScore[dateCol] < 2) return null;
  const descriptionCol = textLen.indexOf(Math.max(...textLen));
  const amountCol = numScore.indexOf(Math.max(...numScore));
  if (numScore[amountCol] < 2 || descriptionCol < 0) return null;

  // Sem cabeçalho, os dados começam na primeira linha que tem data. O
  // "headerRow" é a linha ANTES dessa: fica -1 quando os dados começam logo na
  // primeira linha, para que nenhuma transação seja saltada.
  const firstData = grid.findIndex((r) => looksLikeDate((r?.[dateCol] ?? "").toString()));
  const headerRow = firstData - 1;

  return {
    headerRow,
    dateCol,
    descriptionCol,
    amountCol,
    debitCol: -1,
    creditCol: -1,
    invertSign: guessInvertSign(grid, headerRow, amountCol),
  };
}

/**
 * Aplica o mapeamento e devolve transações normalizadas (gasto = positivo).
 * Linhas sem data ou sem valor válido são ignoradas (totais, saldos, rodapés).
 */
export function rowsToTransactions(
  grid: Grid,
  mapping: ColumnMapping,
  source: string,
  account?: string | null,
): NormalizedTransaction[] {
  const out: NormalizedTransaction[] = [];

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const transactionDate = parseDate((row[mapping.dateCol] ?? "").toString());
    if (!transactionDate) continue;

    let cents: number | null = null;
    if (mapping.amountCol >= 0) {
      cents = parseAmountCents((row[mapping.amountCol] ?? "").toString());
      if (cents !== null && mapping.invertSign) cents = -cents;
    } else {
      const debit = mapping.debitCol >= 0 ? parseAmountCents((row[mapping.debitCol] ?? "").toString()) : null;
      const credit = mapping.creditCol >= 0 ? parseAmountCents((row[mapping.creditCol] ?? "").toString()) : null;
      // Débito = gasto (positivo). Crédito = entrada/reembolso (negativo).
      if (debit !== null && debit !== 0) cents = Math.abs(debit);
      else if (credit !== null && credit !== 0) cents = -Math.abs(credit);
    }
    if (cents === null || cents === 0) continue;

    const description = (row[mapping.descriptionCol] ?? "").toString().trim().replace(/\s+/g, " ");
    if (!description) continue;

    out.push({
      source,
      description,
      amountCents: cents,
      currency: "EUR",
      transactionDate,
      account: account ?? null,
    });
  }

  return out;
}

/**
 * "Impressão digital" da estrutura de um ficheiro: hash dos nomes das colunas do
 * cabeçalho, normalizados. Dois extratos do mesmo banco produzem a mesma
 * impressão, o que permite reutilizar um mapeamento confirmado antes.
 *
 * Só usa NOMES DE COLUNAS, nunca valores. Não há aqui dados financeiros.
 */
export function headerFingerprint(grid: Grid, headerRow: number): string | null {
  const row = grid[headerRow];
  if (!row) return null;
  const cols = row.map(norm).filter((c) => c.length > 0);
  if (cols.length < 3) return null; // demasiado pobre para identificar um banco

  // FNV-1a de 32 bits: chega para distinguir estruturas e é curto.
  let hash = 0x811c9dc5;
  const key = cols.join("|");
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Os nomes das colunas do cabeçalho, para mostrar e para diagnóstico. */
export function headerColumns(grid: Grid, headerRow: number): string[] {
  return (grid[headerRow] ?? []).map((c) => (c ?? "").toString().trim());
}
