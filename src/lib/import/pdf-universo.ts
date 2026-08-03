/**
 * Extrato do cartão Universo em PDF (Tier 2, REQ-IMP-1).
 *
 * O PDF do Universo lista cada movimento numa linha com este aspeto:
 *
 *   "16/0616/06 Compra Restaurante Abaco Porto FIM DO MES0,00 €-9,82 €"
 *    │     │    │                                        │      └ valor total
 *    │     │    │                                        └ comissões e despesas
 *    │     │    └ descrição (termina na modalidade de pagamento)
 *    │     └ data valor (dd/mm, SEM ano)
 *    └ data de realização (dd/mm, SEM ano)
 *
 * As linhas não têm ano: é deduzido do período do extrato ("Movimentos de:
 * 15/06/2026 a 15/07/2026"), tratando a viragem de ano (dez → jan).
 *
 * A saída é uma grelha [data, descrição, valor] para reaproveitar o mesmo
 * pipeline dos ficheiros Excel/CSV (deteção de colunas, dedup e classificação).
 */

import type { Grid } from "./columns";

/**
 * Linha de movimento: duas datas dd/mm coladas, descrição, comissão e total.
 * O espaço entre a data e a descrição é opcional: há extratos que o trazem
 * ("16/0616/06 Compra …") e outros que não ("15/0516/05Compra …").
 */
const MOVEMENT_RE =
  /^(\d{2})\/(\d{2})(\d{2})\/(\d{2})\s*(.+?)(-?[\d.]*\d,\d{2})\s*€\s*(-?[\d.]*\d,\d{2})\s*€\s*$/;

/** Período do extrato, para deduzir o ano de cada movimento. */
const PERIOD_RE = /(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/;

/** Modalidade de pagamento no fim da descrição; não faz parte do comerciante. */
const PLAN_SUFFIX_RE = /\s*(fim do m[eê]s|\d+\s*meses|presta[cç][õo]es)\s*$/i;

export interface UniversoPeriod {
  startYear: number;
  endYear: number;
  start: string;
  end: string;
}

/** Lê o período do extrato a partir das linhas do PDF. */
export function findPeriod(lines: string[]): UniversoPeriod | null {
  for (const line of lines) {
    const m = line.match(PERIOD_RE);
    if (!m) continue;
    const start = `${m[3]}-${m[2]}-${m[1]}`;
    const end = `${m[6]}-${m[5]}-${m[4]}`;
    return { startYear: +m[3]!, endYear: +m[6]!, start, end };
  }
  return null;
}

/**
 * Atribui o ano a um dia/mês sem ano. Um extrato cobre no máximo ~1 mês, por
 * isso basta escolher, entre o ano de início e o de fim, o que cai dentro do
 * período (com folga). Isto trata a viragem de ano (dez/2025 → jan/2026).
 */
export function resolveYear(day: number, month: number, period: UniversoPeriod): number {
  const candidates =
    period.startYear === period.endYear
      ? [period.startYear]
      : [period.startYear, period.endYear];

  for (const year of candidates) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso >= period.start && iso <= period.end) return year;
  }
  // Fora do período (raro): o mês decide. Meses altos pertencem ao ano de início.
  return month >= 7 ? period.startYear : period.endYear;
}

/**
 * Converte as linhas de texto do PDF numa grelha [data, descrição, valor].
 * Linhas que não são movimentos (saldos, totais, rodapés) são ignoradas.
 */
export function universoLinesToGrid(lines: string[]): Grid {
  const period = findPeriod(lines);
  if (!period) return [];

  const grid: Grid = [["Data", "Descrição", "Valor"]];

  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(MOVEMENT_RE);
    if (!m) continue;

    const day = +m[1]!;
    const month = +m[2]!;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const year = resolveYear(day, month, period);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const description = m[5]!.replace(PLAN_SUFFIX_RE, "").trim().replace(/\s+/g, " ");
    if (!description) continue;

    // O valor total já inclui as comissões da linha.
    grid.push([date, description, m[7]!]);
  }

  return grid.length > 1 ? grid : [];
}
