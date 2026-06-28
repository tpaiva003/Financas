/**
 * Regras de divisão (REQ-SPL).
 *
 * Uma divisão calcula, para um dado montante, quanto cada utilizador *deve
 * suportar* (a sua quota-parte). É independente de quem pagou.
 */

import { allocateByWeights } from "./money";
import type { Split, UserId } from "./types";

export interface SplitValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Valida uma divisão para um dado conjunto de participantes e montante.
 * Não lança — devolve o resultado para a UI poder mostrar o erro.
 */
export function validateSplit(
  split: Split,
  participants: UserId[],
  amountCents: number,
): SplitValidationResult {
  if (participants.length === 0) {
    return { ok: false, error: "Sem participantes." };
  }
  const weights = split.weights ?? {};

  switch (split.type) {
    case "EQUAL":
      return { ok: true };

    case "PERCENT": {
      const sum = participants.reduce((acc, u) => acc + (weights[u] ?? 0), 0);
      if (Math.abs(sum - 100) > 1e-9) {
        return { ok: false, error: `As percentagens somam ${sum}, deviam somar 100.` };
      }
      if (participants.some((u) => (weights[u] ?? 0) < 0)) {
        return { ok: false, error: "Percentagens não podem ser negativas." };
      }
      return { ok: true };
    }

    case "SHARES": {
      const sum = participants.reduce((acc, u) => acc + (weights[u] ?? 0), 0);
      if (sum <= 0) {
        return { ok: false, error: "A soma das quotas tem de ser positiva." };
      }
      if (participants.some((u) => (weights[u] ?? 0) < 0)) {
        return { ok: false, error: "Quotas não podem ser negativas." };
      }
      return { ok: true };
    }

    case "FIXED": {
      const sum = participants.reduce((acc, u) => acc + (weights[u] ?? 0), 0);
      if (sum !== amountCents) {
        return {
          ok: false,
          error: `Os montantes fixos somam ${sum}, deviam somar ${amountCents} cêntimos.`,
        };
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: "Tipo de divisão desconhecido." };
  }
}

/**
 * Calcula a quota-parte (em cêntimos) de cada participante.
 * A soma das quotas é sempre exatamente igual a `amountCents`.
 */
export function computeShares(
  amountCents: number,
  split: Split,
  participants: UserId[],
): Record<UserId, number> {
  if (participants.length === 0) {
    throw new Error("Sem participantes para dividir a despesa.");
  }

  const weights = split.weights ?? {};
  const out: Record<UserId, number> = {};

  switch (split.type) {
    case "EQUAL": {
      const alloc = allocateByWeights(
        amountCents,
        participants.map(() => 1),
      );
      participants.forEach((u, i) => (out[u] = alloc[i]!));
      return out;
    }

    case "PERCENT": {
      const validation = validateSplit(split, participants, amountCents);
      if (!validation.ok) throw new Error(validation.error);
      const alloc = allocateByWeights(
        amountCents,
        participants.map((u) => weights[u] ?? 0),
      );
      participants.forEach((u, i) => (out[u] = alloc[i]!));
      return out;
    }

    case "SHARES": {
      const validation = validateSplit(split, participants, amountCents);
      if (!validation.ok) throw new Error(validation.error);
      const alloc = allocateByWeights(
        amountCents,
        participants.map((u) => weights[u] ?? 0),
      );
      participants.forEach((u, i) => (out[u] = alloc[i]!));
      return out;
    }

    case "FIXED": {
      const validation = validateSplit(split, participants, amountCents);
      if (!validation.ok) throw new Error(validation.error);
      participants.forEach((u) => (out[u] = weights[u] ?? 0));
      return out;
    }

    default:
      throw new Error("Tipo de divisão desconhecido.");
  }
}

/** Atalho: divisão 50/50 (default). */
export function equalSplit(): Split {
  return { type: "EQUAL" };
}

/** Atalho: divisão por percentagem (ex.: percentSplit({ a: 70, b: 30 })). */
export function percentSplit(weights: Record<UserId, number>): Split {
  return { type: "PERCENT", weights };
}
