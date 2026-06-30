/**
 * Conversão de texto monetário (formato europeu) para cêntimos, no cliente.
 * Aceita "12,34", "1.234,56" e também "12.34". Devolve 0 se não for número.
 */
export function parseMoneyToCents(s: string): number {
  let t = (s ?? "").trim().replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",") && t.includes(".")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
