/**
 * Utilitários monetários. Todos os valores são cêntimos inteiros.
 */

import type { Currency } from "./types";

/** Converte um valor em unidades (ex.: 12.34) para cêntimos (1234). */
export function toCents(amount: number): number {
  // Arredonda para o cêntimo mais próximo, evitando 12.34 * 100 = 1233.9999...
  return Math.round((amount + Number.EPSILON) * 100);
}

/** Converte cêntimos (1234) para unidades (12.34). */
export function fromCents(cents: number): number {
  return cents / 100;
}

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  EUR: "pt-PT",
  USD: "en-US",
  GBP: "en-GB",
};

/** Formata cêntimos como moeda legível (ex.: 1234 -> "12,34 €"). */
export function formatCents(cents: number, currency: Currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "pt-PT", {
    style: "currency",
    currency,
  }).format(fromCents(cents));
}

/**
 * Distribui um montante inteiro (cêntimos) por pesos, garantindo que a soma das
 * parcelas é EXATAMENTE igual ao montante (método do maior resto). Funciona com
 * montantes negativos (reembolsos) e pesos arbitrários não-negativos.
 *
 * Devolve um array de inteiros, alinhado com o array de pesos.
 */
export function allocateByWeights(amount: number, weights: number[]): number[] {
  if (weights.length === 0) {
    if (amount !== 0) {
      throw new Error("Não é possível distribuir um montante sem participantes.");
    }
    return [];
  }
  if (weights.some((w) => w < 0)) {
    throw new Error("Os pesos não podem ser negativos.");
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new Error("A soma dos pesos não pode ser zero.");
  }

  // Parcela "exata" e parte inteira (floor, em direção a -infinito).
  const exact = weights.map((w) => (amount * w) / total);
  const floors = exact.map((x) => Math.floor(x));
  const allocated = floors.reduce((a, b) => a + b, 0);

  // Cêntimos que faltam atribuir (sempre >= 0, pois floor <= exact).
  let leftover = amount - allocated;

  // Resto fracionário por bucket — quem tiver maior resto recebe +1 primeiro.
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  let k = 0;
  while (leftover > 0 && order.length > 0) {
    const idx = order[k % order.length]!.i;
    result[idx] = result[idx]! + 1;
    leftover -= 1;
    k += 1;
  }
  return result;
}
