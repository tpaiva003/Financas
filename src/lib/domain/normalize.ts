/**
 * Normalização de texto e geração de UID estável para deduplicação.
 *
 * IMPORTANTE: o UID estável e a normalização são a fonte de verdade para evitar
 * duplicados. Para imports, o parser Python existente deve produzir o MESMO UID
 * (mesmo algoritmo de normalização). Esta é a implementação de referência em TS,
 * usada para entradas manuais e testes. Ver DECISOES.md.
 */

import type { NormalizedTransaction } from "./types";

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Remove acentos, baixa para minúsculas e colapsa espaços/pontuação. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // pontuação → espaço
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Hash determinístico FNV-1a (64-bit) em hex. Síncrono, sem dependências,
 * funciona no browser, edge e node. Suficiente para deduplicação de transações
 * a esta escala (dois utilizadores).
 */
export function fnv1a64(input: string): string {
  // BigInt para 64-bit estável e portável.
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Constrói a "chave canónica" de uma transação a partir dos campos
 * normalizados. Esta string é o que se hasheia para obter o UID.
 */
export function canonicalKey(tx: NormalizedTransaction): string {
  return [
    normalizeText(tx.source),
    tx.transactionDate,
    String(tx.amountCents),
    tx.currency,
    normalizeText(tx.account ?? ""),
    normalizeText(tx.description),
  ].join("|");
}

/**
 * UID estável de uma transação normalizada.
 *
 * O `occurrence` é a quantas vezes esta MESMA transação já apareceu antes dela,
 * no mesmo extrato. Zero — a primeira — não entra na chave, de propósito: assim
 * o UID de tudo o que já está gravado continua exatamente o mesmo, e reimportar
 * um extrato antigo continua a reconhecer as despesas que dele saíram.
 *
 * Porquê contar as repetições. A chave é
 * `origem|data|valor|moeda|conta|descrição`, e dois cafés iguais no mesmo dia no
 * mesmo sítio produzem exatamente a mesma chave. Sendo o UID único, o segundo
 * café nunca chegava a existir: desaparecia em silêncio e o saldo ficava a
 * menos. Dois bilhetes de metro, dois abastecimentos, duas voltas ao mesmo
 * quiosque — acontece todos os dias.
 *
 * O invariante está escrito num sentido só ("a mesma transação nunca entra duas
 * vezes") e é fácil esquecer o outro: **duas transações diferentes não podem
 * virar uma**. É a mesma conclusão a que o `newTradesOnly` já tinha chegado para
 * os movimentos de corretora, onde contar as repetições em vez de as apagar
 * resolveu o mesmo problema.
 */
export function stableUid(tx: NormalizedTransaction, occurrence = 0): string {
  const chave = occurrence > 0 ? `${canonicalKey(tx)}|#${occurrence}` : canonicalKey(tx);
  return fnv1a64(chave);
}
