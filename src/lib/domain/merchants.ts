/**
 * Identificação de comerciantes a partir das descrições do extrato.
 *
 * O problema: o mesmo sítio aparece escrito de dezenas de maneiras. "CONTINENTE
 * MODELO MATOSINHOS", "CONT BOM DIA PORTO" e "COMPRA 4471 CONTINENTE" são a
 * mesma coisa e devem contar juntos, mas para um agrupamento por palavras são
 * três comerciantes diferentes.
 *
 * A abordagem, por ordem:
 *
 *  1. **Apelidos confirmados pelo utilizador.** Se alguém já disse que duas
 *     coisas são a mesma, é isso e acabou. Ganha a tudo o resto.
 *  2. **Marcas conhecidas.** Uma lista de marcas com as suas variantes resolve
 *     a maior parte dos casos portugueses sem adivinhar nada.
 *  3. **Primeiras palavras**, como antes, para o que não é reconhecido.
 *
 * Para o que sobrar, `suggestMerges` propõe juntas prováveis que o utilizador
 * confirma, e a confirmação vira apelido (ponto 1). É assim que isto melhora
 * com o uso, em vez de exigir um modelo a adivinhar de cada vez.
 */

/** Marcas conhecidas: chave canónica e as formas como aparecem nos extratos. */
const BRANDS: { key: string; label: string; patterns: string[] }[] = [
  { key: "continente", label: "Continente", patterns: ["continente", "cont bom dia", "modelo continente"] },
  { key: "pingo-doce", label: "Pingo Doce", patterns: ["pingo doce", "pingodoce", "pingo d"] },
  { key: "lidl", label: "Lidl", patterns: ["lidl"] },
  { key: "aldi", label: "Aldi", patterns: ["aldi"] },
  { key: "auchan", label: "Auchan", patterns: ["auchan", "jumbo"] },
  { key: "intermarche", label: "Intermarché", patterns: ["intermarche"] },
  { key: "minipreco", label: "Minipreço", patterns: ["minipreco", "mini preco"] },
  { key: "mercadona", label: "Mercadona", patterns: ["mercadona"] },
  { key: "galp", label: "Galp", patterns: ["galp"] },
  { key: "bp", label: "BP", patterns: ["bp combustiveis", "bp portugal"] },
  { key: "repsol", label: "Repsol", patterns: ["repsol"] },
  { key: "prio", label: "Prio", patterns: ["prio"] },
  { key: "cepsa", label: "Cepsa", patterns: ["cepsa"] },
  { key: "worten", label: "Worten", patterns: ["worten"] },
  { key: "fnac", label: "Fnac", patterns: ["fnac"] },
  { key: "ikea", label: "IKEA", patterns: ["ikea"] },
  { key: "leroy", label: "Leroy Merlin", patterns: ["leroy merlin", "leroy"] },
  { key: "decathlon", label: "Decathlon", patterns: ["decathlon"] },
  { key: "primark", label: "Primark", patterns: ["primark"] },
  { key: "zara", label: "Zara", patterns: ["zara"] },
  { key: "netflix", label: "Netflix", patterns: ["netflix"] },
  { key: "spotify", label: "Spotify", patterns: ["spotify"] },
  { key: "amazon", label: "Amazon", patterns: ["amazon", "amzn"] },
  { key: "apple", label: "Apple", patterns: ["apple com", "itunes", "apple services"] },
  { key: "google", label: "Google", patterns: ["google"] },
  { key: "uber", label: "Uber", patterns: ["uber"] },
  { key: "bolt", label: "Bolt", patterns: ["bolt"] },
  { key: "glovo", label: "Glovo", patterns: ["glovo"] },
  { key: "ubereats", label: "Uber Eats", patterns: ["uber eats", "ubereats"] },
  { key: "mcdonalds", label: "McDonald's", patterns: ["mcdonald", "mc donald"] },
  { key: "starbucks", label: "Starbucks", patterns: ["starbucks"] },
  { key: "cp", label: "CP Comboios", patterns: ["cp comboios", "comboios de portugal", "cp porto"] },
  { key: "metro", label: "Metro", patterns: ["metro do porto", "metropolitano"] },
  { key: "via-verde", label: "Via Verde", patterns: ["via verde", "viaverde"] },
  { key: "edp", label: "EDP", patterns: ["edp"] },
  { key: "galp-energia", label: "Galp Energia", patterns: ["galp energia"] },
  { key: "meo", label: "MEO", patterns: ["meo", "altice"] },
  { key: "nos", label: "NOS", patterns: ["nos comunicacoes", "nos sgps"] },
  { key: "vodafone", label: "Vodafone", patterns: ["vodafone"] },
  { key: "aguas", label: "Águas", patterns: ["aguas do porto", "aguas de", "smas"] },
  { key: "farmacia", label: "Farmácia", patterns: ["farmacia"] },
  { key: "ctt", label: "CTT", patterns: ["ctt"] },
];

const NOISE_PREFIXES = [
  "compras diversas", "compra na internet", "compra", "compras",
  "pagamento de servicos", "pagamento", "debito direto", "dd",
  "transf imed de", "trf imediata p", "transferencia", "trf",
  "levantamento", "mb way", "mbway", "pag servico", "pagamento servicos",
];

export function normalizeDescription(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Tira o tipo de operação do início e os números soltos. */
function stripNoise(normalized: string): string {
  let s = normalized;
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
  return s
    .split(" ")
    .filter((t) => t && !/^\d+$/.test(t))
    .join(" ");
}

export interface Merchant {
  /** Chave de agrupamento. Vazia quando não sobra nada de útil. */
  key: string;
  /** Nome a mostrar. */
  label: string;
  /** Como se chegou aqui, útil para explicar e para depurar. */
  source: "alias" | "brand" | "words";
}

/** Apelidos confirmados: chave gerada por palavras -> comerciante escolhido. */
export type MerchantAliases = Record<string, { key: string; label: string }>;

/**
 * Identifica o comerciante de uma descrição.
 *
 * Os apelidos ganham às marcas, e as marcas ganham às palavras: quanto mais
 * humano for o sinal, mais peso tem.
 */
export function identifyMerchant(
  description: string,
  aliases: MerchantAliases = {},
): Merchant {
  const normalized = normalizeDescription(description);
  const stripped = stripNoise(normalized);
  if (!stripped) return { key: "", label: description.trim() || "Sem descrição", source: "words" };

  const wordKey = stripped.split(" ").slice(0, 2).join(" ");

  const alias = aliases[wordKey] ?? aliases[stripped];
  if (alias) return { ...alias, source: "alias" };

  // A marca procura-se na descrição inteira: o nome pode vir depois do ruído
  // ("compra 4471 continente matosinhos").
  for (const brand of BRANDS) {
    if (brand.patterns.some((p) => normalized.includes(p))) {
      return { key: brand.key, label: brand.label, source: "brand" };
    }
  }

  return { key: wordKey, label: stripped, source: "words" };
}

/** Compatibilidade com o agrupamento antigo (só a chave). */
export function merchantKey(description: string, aliases: MerchantAliases = {}): string {
  return identifyMerchant(description, aliases).key;
}

/** Distância de edição, limitada: só interessa saber se é pequena. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export interface MergeSuggestion {
  /** Chaves que parecem ser o mesmo comerciante. */
  keys: string[];
  /** Nome proposto (o mais curto, que costuma ser o mais limpo). */
  label: string;
  reason: "prefixo" | "quase igual" | "primeira palavra";
}

/**
 * Propõe juntas prováveis entre comerciantes ainda não reconhecidos.
 *
 * Nunca junta nada sozinha: devolve propostas para o utilizador confirmar. Um
 * agrupamento errado estraga os relatórios de forma difícil de detetar, por
 * isso o custo de perguntar é muito menor do que o de adivinhar mal.
 */
export function suggestMerges(labels: string[]): MergeSuggestion[] {
  const unique = [...new Set(labels.filter((l) => l && l.trim()))];
  const used = new Set<string>();
  const out: MergeSuggestion[] = [];

  for (let i = 0; i < unique.length; i++) {
    const a = unique[i]!;
    if (used.has(a)) continue;
    const group = [a];
    let reason: MergeSuggestion["reason"] | null = null;

    for (let j = i + 1; j < unique.length; j++) {
      const b = unique[j]!;
      if (used.has(b)) continue;

      if (a.startsWith(b) || b.startsWith(a)) {
        group.push(b);
        reason = reason ?? "prefixo";
        continue;
      }
      if (editDistance(a, b) <= 2) {
        group.push(b);
        reason = reason ?? "quase igual";
        continue;
      }
      const firstA = a.split(" ")[0]!;
      const firstB = b.split(" ")[0]!;
      // A primeira palavra só chega se for específica: "loja", "cafe" e afins
      // apanhariam meio mundo.
      if (firstA.length >= 5 && firstA === firstB) {
        group.push(b);
        reason = reason ?? "primeira palavra";
      }
    }

    if (group.length > 1 && reason) {
      for (const g of group) used.add(g);
      out.push({
        keys: group,
        label: [...group].sort((x, y) => x.length - y.length)[0]!,
        reason,
      });
    }
  }
  return out;
}
