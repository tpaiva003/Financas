/**
 * Motor de classificação por regras (REQ-CLF).
 *
 * Regras = palavra-chave → categoria e/ou (partilhada|pessoal). Usado para
 * SUGERIR no import e na entrada manual. É sempre sobreponível pelo utilizador.
 *
 * INVARIANTE (REQ-CLF-3): entradas manuais NUNCA são reclassificadas
 * automaticamente por trás. Esta função apenas produz sugestões; a camada de
 * aplicação nunca a aplica sobre uma escolha manual já feita. Ver
 * `classifyForManualEntry`.
 */

import { normalizeText } from "./normalize";
import type { ClassificationResult, ClassificationRule } from "./types";

/**
 * Devolve a primeira regra cujo keyword aparece na descrição (por prioridade).
 * Não decide nada sozinha sobre entradas manuais — ver nota da invariante.
 */
export function classify(
  description: string,
  rules: ClassificationRule[],
): ClassificationResult {
  const haystack = normalizeText(description);

  const ordered = rules
    .filter((r) => r.enabled)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  let categoryId: string | null | undefined;
  let kind: ClassificationResult["kind"];
  let matchedRuleId: string | null | undefined;

  for (const rule of ordered) {
    const needle = normalizeText(rule.keyword);
    if (needle.length === 0) continue;
    if (!haystack.includes(needle)) continue;

    // Primeira regra a tocar define o que ainda não estiver definido.
    if (matchedRuleId == null) matchedRuleId = rule.id;
    if (categoryId === undefined && rule.categoryId != null) {
      categoryId = rule.categoryId;
    }
    if (kind === undefined && rule.kind != null) {
      kind = rule.kind;
    }
    if (categoryId !== undefined && kind !== undefined) break;
  }

  return { categoryId, kind, matchedRuleId };
}

/**
 * Sugestão para um formulário de entrada manual: só preenche campos que o
 * utilizador ainda não tocou. Quando o utilizador edita, o `userTouched`
 * correspondente passa a true e a sugestão deixa de mexer — preservando a
 * escolha manual (REQ-CLF-3).
 */
export function classifyForManualEntry(
  description: string,
  rules: ClassificationRule[],
  userTouched: { category?: boolean; kind?: boolean },
): ClassificationResult {
  const suggestion = classify(description, rules);
  return {
    categoryId: userTouched.category ? undefined : suggestion.categoryId,
    kind: userTouched.kind ? undefined : suggestion.kind,
    matchedRuleId: suggestion.matchedRuleId,
  };
}

/**
 * Testa uma regra contra um histórico de descrições (REQ-CLF-4): devolve as
 * descrições que a regra apanharia. Útil no editor visual de regras.
 */
export function testRuleAgainstHistory(
  rule: Pick<ClassificationRule, "keyword">,
  descriptions: string[],
): string[] {
  const needle = normalizeText(rule.keyword);
  if (needle.length === 0) return [];
  return descriptions.filter((d) => normalizeText(d).includes(needle));
}
