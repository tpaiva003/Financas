/**
 * Quanto vale o imóvel ao preço da zona.
 *
 * **O que isto é.** Um imóvel fica registado pelo valor que alguém lhe pôs — o
 * da escritura, quase sempre — e nunca mais se mexe. Ao fim de uns anos, o
 * património tem lá uma casa avaliada ao preço de 2019. Com a área e o sítio, e
 * com o preço mediano por metro quadrado que o INE publica, dá para dizer
 * quanto é que a casa valeria à mediana da zona.
 *
 * **O que isto não é: uma avaliação.** A mediana da zona não sabe se a casa é
 * num último andar com vista ou num rés do chão para as traseiras, se está
 * pronta ou a precisar de tudo. A diferença entre uma coisa e outra é facilmente
 * 30%. Por isso o número aparece **ao lado** do valor registado e nunca por cima
 * dele.
 *
 * **A geografia resolve-se por nome, não por código.** Uma tabela de códigos
 * mantida aqui dentro dessincronizava-se em silêncio. Pede-se ao INE a lista
 * toda e compara-se pelo nome que ele próprio devolve.
 *
 * **Mas comparar por sub-cadeia era pior do que não comparar.** A primeira
 * versão aceitava um nome do INE que fosse sub-cadeia do que a pessoa escreveu.
 * Escrever "Paranhos, Porto" trazia **Tó** — a freguesia de Mogadouro — porque
 * "por**to**" contém "to". Com oito lugares na lista, os oito "Tó" empurravam
 * o Porto e Paranhos para fora do ecrã. Agora compara-se **por palavras
 * inteiras**: um nome de duas letras só entra se alguém escrever essas duas
 * letras como palavra.
 *
 * **A lista do INE tem vários níveis ao mesmo tempo** — país, regiões,
 * concelhos e algumas freguesias — e há nomes repetidos entre níveis (Odivelas
 * é concelho e é freguesia). Por isso cada candidato leva o sítio onde está
 * "dentro de": sem isso, o ecrã mostrava dois botões iguais com preços
 * diferentes e não havia forma de escolher.
 *
 * Lógica pura, sem rede.
 */

/** Uma linha do indicador do INE, já limpa. */
export interface InePriceRow {
  /**
   * O código geográfico do INE. Guarda-se e **usa-se**: é ele que diz o que
   * está dentro de quê, porque o código de uma freguesia começa pelo do
   * concelho. É a única hierarquia fiável que a resposta traz.
   */
  geocod: string;
  /** O nome como o INE o escreve: "Lisboa", "Vila Nova de Gaia". */
  geodsg: string;
  /** Euros por metro quadrado, em cêntimos. */
  pricePerM2Cents: number;
  /** A categoria de alojamento, quando o indicador a separa. */
  categoria?: string | null;
}

/** Um período do indicador, com as linhas todas desse período. */
export interface InePeriodo {
  period: string;
  rows: InePriceRow[];
}

/** O que se conseguiu ler do indicador. */
export interface InePriceTable {
  /** O período mais recente, como o INE o identifica. */
  period: string;
  /** As linhas do período mais recente. É por aqui que se procura um sítio. */
  rows: InePriceRow[];
  /**
   * **Todos** os períodos, do mais antigo para o mais recente.
   *
   * A primeira versão deitava fora tudo menos o último, e com isso deitava fora
   * a única coisa que permite dizer quanto é que a zona valorizou desde que
   * alguém comprou a casa. Vem tudo no mesmo pedido: guardá-lo não custa nada e
   * é o que faz o valor do imóvel acompanhar o índice em vez de ficar parado.
   */
  periodos: InePeriodo[];
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

/** As palavras de um nome, sem pontuação. É a unidade de comparação. */
function palavras(s: string): string[] {
  return normalizarLocal(s)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Elos que não distinguem sítios nenhuns: "Vila Nova de Gaia" e "Vila Nova Gaia". */
const ELOS = new Set(["de", "do", "da", "dos", "das", "e"]);

/**
 * O nome sem os elos — mas **nunca vazio**. Há freguesias chamadas "Ul" e "Sé";
 * esvaziar um nome fá-lo-ia casar com tudo.
 */
function nucleo(ps: string[]): string[] {
  const sem = ps.filter((p) => !ELOS.has(p));
  return sem.length > 0 ? sem : ps;
}

/**
 * O valor numérico de uma célula do INE.
 *
 * O INE devolve **duas** versões de cada número: `ind_string` para se ler
 * ("2 345,67") e `valor` para se usar ("2345.67"). Lê-se o `valor`, onde o
 * ponto é decimal — daí um ponto sozinho ser sempre decimal aqui.
 *
 * Aguenta na mesma o formato português completo, para o dia em que a app pedir
 * outro indicador: quando aparecem os dois separadores, **o último é o
 * decimal**, que é a única regra que funciona nos dois lados do Atlântico.
 */
function numeroDoIne(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;

  let s = v.trim().replace(/\s/g, "");
  if (s === "") return null;

  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    // Os dois: o que vem depois é o decimal, o outro é separador de milhares.
    s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgula >= 0) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * A ordem de um período do INE.
 *
 * As chaves vêm **em português por extenso** — "1.º Trimestre de 2026" — e não
 * como códigos. Ordená-las por texto punha "4.º Trimestre de 2019" à frente de
 * "1.º Trimestre de 2026" e a app mostrava preços de há sete anos como se
 * fossem os de agora. Lê-se o ano e o trimestre e ordena-se por eles.
 */
export function ordemDoPeriodo(p: string): number {
  const ano = p.match(/(\d{4})/);
  if (!ano) return 0;
  const parte = p.match(/(\d)\s*\.?\s*[ºo]?\s*(trimestre|semestre)/i);
  return Number(ano[1]) * 10 + (parte ? Number(parte[1]) : 9);
}

/**
 * Ler a resposta do indicador do INE.
 *
 * A API devolve um array com um objeto que traz `Dados`, um mapa de período
 * para lista de linhas. Fica-se com o período mais recente.
 *
 * Devolve `null` quando não reconhece o formato, em vez de uma tabela vazia:
 * uma tabela vazia lê-se como "o sítio não está lá" e mandaria alguém procurar
 * o erro no sítio errado.
 */
function linhasDoPeriodo(brutas: unknown): InePriceRow[] {
  if (!Array.isArray(brutas)) return [];
  /**
   * Um sítio por código. Quando o indicador separa categorias de alojamento, o
   * mesmo sítio vem mais do que uma vez — e mostrar o mesmo nome cinco vezes
   * com preços diferentes não é escolha, é confusão. Fica a primeira, e a
   * categoria vai junto para o ecrã a poder dizer qual é.
   */
  const porCodigo = new Map<string, InePriceRow>();
  for (const item of brutas) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const geodsg = typeof r.geodsg === "string" ? r.geodsg.trim() : "";
    const geocod = typeof r.geocod === "string" ? r.geocod.trim() : "";
    const valor = numeroDoIne(r.valor);
    // Sem nome não há como escolher, e sem valor não há o que mostrar. O INE
    // usa linhas sem valor para os sítios onde houve poucas transações.
    if (!geodsg || valor === null || valor <= 0) continue;
    const chave = geocod || geodsg;
    if (porCodigo.has(chave)) continue;
    const categoria = typeof r.dim_3_t === "string" ? r.dim_3_t.trim() : "";
    porCodigo.set(chave, {
      geocod,
      geodsg,
      pricePerM2Cents: Math.round(valor * 100),
      categoria: categoria || null,
    });
  }
  return [...porCodigo.values()];
}

export function parseInePriceTable(raw: unknown): InePriceTable | null {
  const primeiro = Array.isArray(raw) ? raw[0] : raw;
  if (!primeiro || typeof primeiro !== "object") return null;

  const dados = (primeiro as Record<string, unknown>).Dados;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;

  const chaves = Object.keys(dados as Record<string, unknown>);
  if (chaves.length === 0) return null;

  const periodos: InePeriodo[] = [];
  for (const period of [...chaves].sort((a, b) => ordemDoPeriodo(a) - ordemDoPeriodo(b))) {
    const rows = linhasDoPeriodo((dados as Record<string, unknown>)[period]);
    if (rows.length > 0) periodos.push({ period, rows });
  }
  if (periodos.length === 0) return null;

  const ultimo = periodos[periodos.length - 1]!;
  return { period: ultimo.period, rows: ultimo.rows, periodos };
}

/** Um sítio encontrado, com o que faz falta para o distinguir de outro igual. */
export interface LocalCandidato {
  row: InePriceRow;
  /**
   * O sítio imediatamente acima na hierarquia do INE. É isto que distingue a
   * freguesia de Odivelas do concelho de Odivelas no ecrã.
   */
  dentroDe: string | null;
  /** Quantos níveis acima tem. Serve para preferir o concelho à freguesia. */
  profundidade: number;
  /** Quanto é que o nome bateu certo. Só para ordenar. */
  pontos: number;
}

export interface BuscaLocal {
  /** Só há escolhido quando um sítio ganha sozinho. */
  escolhido: LocalCandidato | null;
  /** O nome batia certo por inteiro? */
  exato: boolean;
  /** Sítios parecidos, do mais provável para o menos. */
  candidatos: LocalCandidato[];
}

/** Quantos nomes parecidos se oferecem. Mais do que isto é uma lista, não uma ajuda. */
const MAX_CANDIDATOS = 8;

/** Quanto vale saber a zona ("Paranhos, **Porto**"). Nunca chega para virar um empate de nomes. */
const BONUS_ZONA = 25;

/**
 * Quanto é que o nome do INE responde ao que a pessoa escreveu.
 *
 * Zero quer dizer "não é isto". Tudo por **palavras inteiras**: é isso que
 * impede um nome de duas letras de entrar por dentro de outra palavra, que foi
 * o que trouxe "Tó" para uma procura por "Paranhos, Porto".
 */
function pontuar(nome: string, alvo: string): number {
  const tn = palavras(nome);
  const tp = palavras(alvo);
  if (tn.length === 0 || tp.length === 0) return 0;

  const n = tn.join(" ");
  const p = tp.join(" ");
  if (n === p) return 100;
  if (nucleo(tn).join(" ") === nucleo(tp).join(" ")) return 95;

  const corrida = (agulha: string[], palheiro: string[]): number => {
    if (agulha.length > palheiro.length) return -1;
    for (let i = 0; i <= palheiro.length - agulha.length; i++) {
      if (agulha.every((w, k) => palheiro[i + k] === w)) return i;
    }
    return -1;
  };

  // "Vila Nova" -> Vila Nova de Gaia. O princípio do nome vale mais.
  const ondeNoNome = corrida(tp, tn);
  if (ondeNoNome === 0) return 80;
  if (ondeNoNome > 0) return 70;

  // "concelho do Porto" -> Porto. O nome inteiro dentro do que se escreveu.
  if (corrida(tn, tp) >= 0) return 65;

  // As palavras todas lá estão, mas trocadas.
  if (tp.every((w) => tn.includes(w))) return 55;

  return 0;
}

/** Os pais de um sítio, do mais próximo ao mais distante, pelo código. */
function ascendentes(row: InePriceRow, rows: readonly InePriceRow[]): InePriceRow[] {
  if (!row.geocod) return [];
  return rows
    .filter((o) => o.geocod && o.geocod.length < row.geocod.length && row.geocod.startsWith(o.geocod))
    .sort((a, b) => b.geocod.length - a.geocod.length);
}

/**
 * Encontrar o sítio pelo nome escrito à mão.
 *
 * A vírgula separa o sítio do contexto: em "Paranhos, Porto" procura-se
 * **Paranhos**, e "Porto" serve só para desempatar entre Paranhos nenhures e
 * Paranhos dentro do Porto. É como se escreve uma morada, do específico para o
 * geral.
 *
 * **Não se desempata sozinho.** Duas Lagoas, uma nos Açores e outra no Algarve,
 * com o dobro do preço uma da outra: escolher a primeira era acertar por sorte
 * numa em duas, e o erro ficava calado.
 */
export function procurarLocal(rows: InePriceRow[], query: string): BuscaLocal {
  const segmentos = normalizarLocal(query)
    .split(/[,;/]|\s-\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segmentos.length === 0) return { escolhido: null, exato: false, candidatos: [] };

  const principal = segmentos[0]!;
  const zonas = segmentos.slice(1).flatMap((s) => palavras(s));

  const marcados: LocalCandidato[] = [];
  for (const row of rows) {
    const base = pontuar(row.geodsg, principal);
    if (base === 0) continue;

    const acima = ascendentes(row, rows);
    // O contexto só conta se aparecer mesmo por cima deste sítio.
    const nomesAcima = acima.flatMap((a) => palavras(a.geodsg));
    const bate = zonas.length > 0 && zonas.some((z) => nomesAcima.includes(z));

    marcados.push({
      row,
      dentroDe: acima[0]?.geodsg ?? null,
      profundidade: acima.length,
      pontos: base + (bate ? BONUS_ZONA : 0),
    });
  }

  if (marcados.length === 0) return { escolhido: null, exato: false, candidatos: [] };

  marcados.sort(
    (a, b) =>
      b.pontos - a.pontos ||
      // Empatados, o mais abrangente primeiro: o campo pergunta pelo concelho.
      a.profundidade - b.profundidade ||
      a.row.geodsg.localeCompare(b.row.geodsg, "pt"),
  );

  const melhor = marcados[0]!;
  const empatados = marcados.filter((m) => m.pontos === melhor.pontos);
  if (empatados.length === 1) {
    return { escolhido: melhor, exato: melhor.pontos >= 100, candidatos: [] };
  }
  return { escolhido: null, exato: false, candidatos: marcados.slice(0, MAX_CANDIDATOS) };
}

/**
 * A ordem de uma data, na mesma escala dos períodos do INE.
 *
 * "2023-02-13" cai no 1.º trimestre de 2023, que dá 20231 — comparável com o
 * que o `ordemDoPeriodo` devolve.
 */
export function ordemDaData(onDate: string): number {
  const ano = Number(onDate.slice(0, 4));
  const mes = Number(onDate.slice(5, 7));
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1) return 0;
  return ano * 10 + Math.ceil(mes / 3);
}

/**
 * O preço por m² de um sítio numa data passada.
 *
 * Fica-se com o último período **até** à data: em Fevereiro de 2023 o que se
 * sabia era o do 1.º trimestre de 2023 (ou o anterior, se esse ainda não
 * existir). Devolve `null` quando a série não recua até lá — e é assim que tem
 * de ser: sem o índice da altura não há valorização para calcular, e inventar
 * uma é inventar o valor da casa.
 */
export function precoNaData(
  periodos: readonly InePeriodo[],
  geocod: string,
  onDate: string,
): { cents: number; period: string } | null {
  const alvo = ordemDaData(onDate);
  if (!geocod || alvo === 0) return null;

  let melhor: { cents: number; period: string } | null = null;
  for (const p of periodos) {
    if (ordemDoPeriodo(p.period) > alvo) continue;
    const linha = p.rows.find((r) => r.geocod === geocod);
    if (linha) melhor = { cents: linha.pricePerM2Cents, period: p.period };
  }
  return melhor;
}

/** O que o imóvel custou, somado. */
export interface CustoImovel {
  /** O que se pagou na escritura. */
  purchasePriceCents?: number | null;
  /** O que se meteu em obras desde então. */
  worksCents?: number | null;
}

/** Quanto custou o imóvel ao todo: compra mais obras. */
export function custoTotalImovel(c: CustoImovel): number | null {
  const compra = typeof c.purchasePriceCents === "number" ? c.purchasePriceCents : null;
  if (compra === null || compra <= 0) return null;
  const obras = typeof c.worksCents === "number" && c.worksCents > 0 ? c.worksCents : 0;
  return compra + obras;
}

/** Como é que o valor do imóvel foi parar ao número que se mostra. */
export interface ValorImovel {
  valueCents: number;
  custoCents: number;
  /** Quanto a zona valorizou desde a compra: 1,2 é mais vinte por cento. */
  fator: number;
  /** Os dois índices que deram o fator, para se poder conferir. */
  indiceCompraCents: number;
  indiceHojeCents: number;
  periodoCompra: string;
  periodoHoje: string;
}

/**
 * O valor do imóvel hoje: o que custou, a acompanhar o índice da zona.
 *
 * **Porquê assim e não só "área × preço da zona".** A mediana do concelho
 * aplicada à área diz quanto valeria uma casa *média* daquele tamanho naquela
 * zona — e uma casa concreta não é a média: pode ser um T2 sem elevador ou um
 * último andar remodelado, e entre as duas vão 30%. O que se sabe de verdade
 * sobre esta casa é **o que se pagou por ela** e **o que se meteu em obras**.
 * Partir daí e aplicar-lhe a valorização da zona respeita as duas coisas: o
 * ponto de partida é um facto, e só a variação vem da estatística.
 *
 * As obras entram no custo mas **não são valorizadas desde a compra** — entram
 * pelo que custaram. Aplicar-lhes o índice desde a escritura seria dizer que
 * uma cozinha feita o ano passado valorizou desde 2019.
 *
 * Devolve `null` quando falta alguma coisa. Nunca assume um fator de 1: isso
 * daria o custo com ar de avaliação.
 */
export function valorImovelPeloIndice(input: {
  custoCents: number | null;
  indiceCompra: { cents: number; period: string } | null;
  indiceHoje: { cents: number; period: string } | null;
}): ValorImovel | null {
  const { custoCents, indiceCompra, indiceHoje } = input;
  if (custoCents === null || custoCents <= 0) return null;
  if (!indiceCompra || !indiceHoje) return null;
  if (indiceCompra.cents <= 0 || indiceHoje.cents <= 0) return null;

  const fator = indiceHoje.cents / indiceCompra.cents;
  return {
    valueCents: Math.round(custoCents * fator),
    custoCents,
    fator,
    indiceCompraCents: indiceCompra.cents,
    indiceHojeCents: indiceHoje.cents,
    periodoCompra: indiceCompra.period,
    periodoHoje: indiceHoje.period,
  };
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
