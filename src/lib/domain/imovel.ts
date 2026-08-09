/**
 * Quanto vale o imóvel ao preço da zona.
 *
 * **O que isto é.** Um imóvel fica registado pelo valor que alguém lhe pôs — o
 * da escritura, quase sempre — e nunca mais se mexe. Ao fim de uns anos, o
 * património tem lá uma casa avaliada ao preço de 2019. Com a área e o
 * concelho, e com o preço mediano por metro quadrado que o INE publica, dá para
 * dizer quanto é que a casa valeria à mediana da zona.
 *
 * **O que isto não é: uma avaliação.** A mediana do concelho não sabe se a casa
 * é num último andar com vista ou num rés do chão para as traseiras, se está
 * pronta ou a precisar de tudo. A diferença entre uma coisa e outra é
 * facilmente 30%. Por isso o número aparece **ao lado** do valor registado e
 * nunca por cima dele: é uma referência para se decidir se vale a pena mexer no
 * valor, não o valor. Substituí-lo automaticamente seria trocar um número
 * desatualizado que se sabe desatualizado por um número errado com ar de facto.
 *
 * **A geografia resolve-se por nome, não por código.** Os códigos de concelho
 * do INE eram uma tabela de trezentas linhas a manter aqui dentro, a
 * dessincronizar-se em silêncio. Em vez disso pede-se ao INE a lista toda e
 * compara-se pelo nome que ele próprio devolve — sem acentos e sem maiúsculas,
 * que é onde isto costuma falhar.
 *
 * Lógica pura, sem rede.
 */

/** Uma linha do indicador do INE, já limpa. */
export interface InePriceRow {
  /** O código geográfico do INE. Guarda-se, não se inventa. */
  geocod: string;
  /** O nome como o INE o escreve: "Lisboa", "Vila Nova de Gaia". */
  geodsg: string;
  /** Euros por metro quadrado, em cêntimos. */
  pricePerM2Cents: number;
}

/** O que se conseguiu ler do indicador. */
export interface InePriceTable {
  /** O período a que os valores dizem respeito, como o INE o identifica. */
  period: string;
  rows: InePriceRow[];
}

/**
 * Sem acentos, sem maiúsculas, sem espaços a mais.
 *
 * "Vila Nova de Gaia" e "vila nova de gaia" são o mesmo sítio, e escrever o
 * nome de um concelho português com todos os acentos no sítio certo à primeira
 * não é coisa que se peça a ninguém.
 */
export function normalizarLocal(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    // Os combinantes ficam em escapes: literais aqui seriam invisíveis no código.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function numeroDoIne(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // O INE devolve os valores como texto, e nem sempre com ponto decimal.
  const limpo = v.trim().replace(/\s/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ler a resposta do indicador do INE.
 *
 * A API devolve um array com um objeto que traz `Dados`, um mapa de período
 * para lista de linhas. Fica-se com o período mais recente.
 *
 * Devolve `null` quando não reconhece o formato, em vez de uma tabela vazia:
 * uma tabela vazia lê-se como "o concelho não está lá" e mandaria alguém
 * procurar o erro no sítio errado.
 */
export function parseInePriceTable(raw: unknown): InePriceTable | null {
  const primeiro = Array.isArray(raw) ? raw[0] : raw;
  if (!primeiro || typeof primeiro !== "object") return null;

  const dados = (primeiro as Record<string, unknown>).Dados;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;

  const periodos = Object.keys(dados as Record<string, unknown>);
  if (periodos.length === 0) return null;
  // Os períodos do INE ordenam-se bem por texto: "2024", "2025", "2025T1".
  const period = periodos.sort()[periodos.length - 1]!;

  const brutas = (dados as Record<string, unknown>)[period];
  if (!Array.isArray(brutas)) return null;

  const rows: InePriceRow[] = [];
  for (const item of brutas) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const geodsg = typeof r.geodsg === "string" ? r.geodsg.trim() : "";
    const geocod = typeof r.geocod === "string" ? r.geocod.trim() : "";
    const valor = numeroDoIne(r.valor);
    // Sem nome não há como escolher, e sem valor não há o que mostrar. O INE
    // usa linhas sem valor para os sítios onde houve poucas transações.
    if (!geodsg || valor === null || valor <= 0) continue;
    rows.push({ geocod, geodsg, pricePerM2Cents: Math.round(valor * 100) });
  }

  if (rows.length === 0) return null;
  return { period, rows };
}

export interface LocalEncontrado {
  row: InePriceRow;
  /** Foi o nome exato, ou uma aproximação que ainda tem de ser confirmada? */
  exato: boolean;
}

export interface BuscaLocal {
  escolhido: LocalEncontrado | null;
  /** Outros sítios com nome parecido, para se poder escolher. */
  candidatos: InePriceRow[];
}

/** Quantos nomes parecidos se oferecem. Mais do que isto é uma lista, não uma ajuda. */
const MAX_CANDIDATOS = 8;

/**
 * Encontrar o concelho pelo nome escrito à mão.
 *
 * Só se escolhe sozinho quando o nome bate certo por inteiro. Um "Vila Nova"
 * escrito à pressa dá candidatos para escolher, e não a primeira das seis Vilas
 * Novas que o INE tem — que seria acertar por sorte numa em seis.
 */
export function procurarLocal(rows: InePriceRow[], query: string): BuscaLocal {
  const alvo = normalizarLocal(query);
  if (!alvo) return { escolhido: null, candidatos: [] };

  const exatos = rows.filter((r) => normalizarLocal(r.geodsg) === alvo);
  if (exatos.length === 1) {
    return { escolhido: { row: exatos[0]!, exato: true }, candidatos: [] };
  }
  // Dois sítios com o mesmo nome (há-os: "Lagoa" nos Açores e no Algarve) não
  // se desempatam por ordem de chegada.
  if (exatos.length > 1) return { escolhido: null, candidatos: exatos.slice(0, MAX_CANDIDATOS) };

  const parciais = rows.filter((r) => {
    const n = normalizarLocal(r.geodsg);
    return n.includes(alvo) || alvo.includes(n);
  });
  if (parciais.length === 1) {
    return { escolhido: { row: parciais[0]!, exato: false }, candidatos: [] };
  }
  return { escolhido: null, candidatos: parciais.slice(0, MAX_CANDIDATOS) };
}

/** O que um imóvel precisa de ter para se lhe estimar o valor. */
export interface ImovelRef {
  areaM2?: number | null;
  /** Euros por metro quadrado de referência, em cêntimos. */
  priceRefCents?: number | null;
}

/**
 * O valor do imóvel ao preço de referência: área × preço por m².
 *
 * Devolve `null` quando falta um dos dois. Nunca assume uma área média nem um
 * preço médio: um valor de imóvel inventado entra no património e desloca o
 * número que a app existe para mostrar.
 */
export function estimatedPropertyCents(a: ImovelRef): number | null {
  const area = typeof a.areaM2 === "number" && Number.isFinite(a.areaM2) ? a.areaM2 : null;
  const preco =
    typeof a.priceRefCents === "number" && Number.isFinite(a.priceRefCents) ? a.priceRefCents : null;
  if (area === null || preco === null) return null;
  if (area <= 0 || preco <= 0) return null;
  return Math.round(area * preco);
}

/**
 * O que a estimativa diz sobre o valor registado.
 *
 * `ratio` é quanto a estimativa é do valor registado: 1,2 é vinte por cento
 * acima. Devolve `null` quando não há termo de comparação — e não zero, que se
 * leria como "está igual".
 */
export function compararComRegistado(
  estimateCents: number | null,
  valueCents: number | null | undefined,
): { difCents: number; ratio: number } | null {
  if (estimateCents === null || estimateCents <= 0) return null;
  if (typeof valueCents !== "number" || !Number.isFinite(valueCents) || valueCents <= 0) return null;
  return { difCents: estimateCents - valueCents, ratio: estimateCents / valueCents };
}
