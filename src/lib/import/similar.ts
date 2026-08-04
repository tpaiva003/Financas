/**
 * Agrupamento de descrições semelhantes (REQ-IMP-3, edição em massa).
 *
 * Os extratos repetem o mesmo comerciante com ruído à volta: "Compra
 * Restaurante Abaco Porto", "COMPRA 1511 LEITARIA QUINTA DO PPORTO",
 * "DD VODAFONEPORTUGAL-07459083287". Para poder oferecer "aplicar esta
 * categoria a todas as semelhantes", reduzimos cada descrição a uma chave que
 * ignora o tipo de operação, os números e a localidade final.
 *
 * É deliberadamente conservador: mais vale não sugerir do que juntar coisas
 * diferentes na mesma categoria.
 */

const NOISE_PREFIXES = [
  "compras diversas",
  "compra na internet",
  "compra",
  "compras",
  "pagamento de servicos",
  "pagamento",
  "debito direto",
  "dd",
  "transf imed de",
  "trf imediata p",
  "transferencia",
  "trf",
  "levantamento",
  "mb way",
];

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Chave de semelhança de uma descrição. Duas descrições com a mesma chave são
 * tratadas como do mesmo comerciante. Devolve "" quando não sobra nada de útil
 * (nesse caso não se sugere agrupamento).
 */
export function similarityKey(description: string): string {
  let s = normalize(description);
  if (!s) return "";

  // Tira o tipo de operação do início (pode haver mais do que um).
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of NOISE_PREFIXES) {
      if (s === prefix) return "";
      if (s.startsWith(`${prefix} `)) {
        s = s.slice(prefix.length + 1);
        changed = true;
        break;
      }
    }
  }

  // Tira números soltos (referências, nº de contrato, terminal).
  const tokens = s.split(" ").filter((t) => t && !/^\d+$/.test(t));
  if (tokens.length === 0) return "";

  // Duas primeiras palavras chegam para identificar o comerciante sem juntar
  // sítios diferentes da mesma cadeia.
  return tokens.slice(0, 2).join(" ");
}

/** Índices das linhas com a mesma chave de semelhança (inclui a própria). */
export function findSimilar(descriptions: string[], index: number): number[] {
  const key = similarityKey(descriptions[index] ?? "");
  if (!key) return [index];
  return descriptions.flatMap((d, i) => (similarityKey(d) === key ? [i] : []));
}
