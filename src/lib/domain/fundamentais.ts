/**
 * Ler as contas de uma empresa a partir da resposta do Yahoo Finance.
 *
 * **Porque é que isto é um módulo puro e não umas linhas dentro do serviço.**
 * O formato do Yahoo é um labirinto de `{ raw, fmt }` aninhados, com módulos
 * que às vezes vêm e às vezes não, e campos que mudam de nome entre empresas
 * (`ebit` num relatório, `operatingIncome` noutro). Um formato assim tem de se
 * poder exercitar sem rede — e sobretudo tem de se poder provar que uma
 * resposta a que faltam metade dos campos não produz números inventados.
 *
 * **A regra que mandou em tudo o que está aqui: sem denominador, não há rácio.**
 * Uma empresa com capital próprio negativo tem um ROE que, calculado à letra,
 * sai positivo e enorme — e é exactamente ao contrário do que significa. Um
 * `null` é honesto; um 340% não é. É o mesmo princípio de "sem taxa de câmbio
 * não se grava preço nenhum", aplicado a rácios.
 *
 * **A moeda do relato não é sempre a moeda da cotação.** Um ADR cota em dólares
 * e relata em euros, e nesse caso o valor por ação que sai do DCF e o preço a
 * que se compara estão em moedas diferentes — um erro que não se vê, porque
 * ambos os números têm o tamanho certo. Por isso as duas moedas vêm ao de cima
 * e quem chama avisa.
 *
 * Lógica pura, sem acesso a dados.
 */

import { forSource, moedaDeSubunidade } from "./quotes";

/** Um período de contas, com os rácios já calculados. */
export interface AnoFundamental {
  ano: number;
  /**
   * Como o período se chama: "2025" num exercício, "set/25" num trimestre.
   *
   * **Os trimestres são rotulados pelo mês em que acabam e não por "T1…T4".**
   * O ano fiscal da Apple acaba em setembro e o primeiro trimestre dela fecha
   * em dezembro — chamar-lhe "T1" quando o calendário diz T4, ou "T4" quando a
   * empresa lhe chama T1, engana das duas maneiras. O mês de fecho não precisa
   * de convenção nenhuma para se ler.
   */
  rotulo: string;
  /** O fim do período, "AAAA-MM-DD". É por aqui que a série se ordena. */
  fim: string | null;
  receitaBilioes: number | null;
  margemBrutaPct: number | null;
  margemOperacionalPct: number | null;
  margemLiquidaPct: number | null;
  /** Retorno sobre o capital empregue: EBIT / (ativo total − passivo corrente). */
  rocePct: number | null;
  roePct: number | null;
  /** Dívida total sobre capital próprio, em percentagem. */
  dividaSobreCapitalPct: number | null;
  /** Ativo corrente sobre passivo corrente. Abaixo de 1 é aperto de tesouraria. */
  liquidezCorrente: number | null;
  fcfBilioes: number | null;
  margemFcfPct: number | null;
}

/** As médias do historial, para não se ler uma tabela à procura delas. */
export interface MediasHistoricas {
  rocePct: number | null;
  margemOperacionalPct: number | null;
  margemLiquidaPct: number | null;
  margemFcfPct: number | null;
  /** Crescimento anual composto do FCF ao longo do historial. */
  crescimentoFcfPct: number | null;
  crescimentoReceitaPct: number | null;
  /** Quantos anos entraram nestas contas. */
  anos: number;
}

/** O que os analistas dizem, quando o dizem. Serve de referência, não de dado. */
export interface EstimativasAnalistas {
  crescimento1aPct: number | null;
  crescimento5aPct: number | null;
}

/** Datas que valem um lembrete. */
export interface DatasEmpresa {
  /** Próxima apresentação de resultados, "AAAA-MM-DD". */
  resultados: string | null;
  dividendo: string | null;
  exDividendo: string | null;
}

export interface Fundamentais {
  nome: string | null;
  /** Moeda em que a ação cota, já normalizada (GBp vira GBP). */
  moedaCotacao: string | null;
  /** Moeda em que a empresa relata as contas. Nem sempre é a mesma. */
  moedaRelato: string | null;
  /** Preço por ação, na moeda da cotação e já em unidades (não em pence). */
  precoUnidade: number | null;
  /** Fluxo de caixa livre dos últimos doze meses, em milhares de milhões. */
  fcfBilioes: number | null;
  acoesBilioes: number | null;
  /** Dívida total (curto mais longo prazo), em milhares de milhões. */
  dividaBilioes: number | null;
  caixaBilioes: number | null;
  /**
   * Setor e indústria, como a fonte lhes chama (em inglês).
   *
   * Ficam em bruto de propósito: a tradução vive em `setorPorExtenso`, e um
   * nome que a fonte estreie tem de chegar ao ecrã como está em vez de cair
   * numa fatia "Outros" onde ninguém dá por ele.
   */
  setor: string | null;
  industria: string | null;
  /**
   * O que a fonte diz que isto é: `EQUITY`, `ETF`, `MUTUALFUND`, `INDEX`…
   *
   * Vinha na resposta desde sempre — o módulo `price` já era pedido — e era
   * deitado fora. Sem ele, separar ações de fundos ficava a cargo de adivinhar
   * pelo nome ou pela ausência de setor, e as duas adivinhas erram: há ETF
   * setoriais com setor e há empresas cujo perfil não veio.
   *
   * Em bruto, pela mesma razão do setor: um tipo novo chega ao ecrã como está
   * em vez de cair calado num grupo onde ninguém dá por ele.
   */
  tipoFonte: string | null;
  /** Exercícios anuais, do mais antigo para o mais recente. */
  historico: AnoFundamental[];
  /**
   * Trimestres, do mais antigo para o mais recente.
   *
   * Serve para ver a tendência recente com mais resolução — quatro pontos
   * anuais escondem uma margem que virou há dois trimestres. **Não entra em
   * nenhuma conta**: as médias, o CAGR e os cenários continuam a sair só dos
   * exercícios anuais, porque um trimestre comparado com o anterior mede
   * sazonalidade tanto como desempenho.
   */
  trimestral: AnoFundamental[];
  medias: MediasHistoricas;
  estimativas: EstimativasAnalistas;
  datas: DatasEmpresa;
  /**
   * Os campos que a fonte não trouxe, por extenso.
   *
   * Existe para o ecrã poder dizer "faltou o fluxo de caixa livre, escreve-o à
   * mão" em vez de deixar um campo vazio sem explicação. Um formulário que se
   * preenche a meio e não diz porquê parece avariado.
   */
  emFalta: string[];
}

/** Os módulos do Yahoo que esta leitura precisa. */
export const MODULOS_FUNDAMENTAIS = [
  "price",
  "defaultKeyStatistics",
  "financialData",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  // Os mesmos três, por trimestre. Vêm no mesmo pedido e no mesmo custo: o
  // `quoteSummary` aceita a lista toda de uma vez.
  "incomeStatementHistoryQuarterly",
  "balanceSheetHistoryQuarterly",
  "cashflowStatementHistoryQuarterly",
  "earningsTrend",
  "calendarEvents",
  // O setor e a indústria, para a carteira saber a que está exposta.
  "assetProfile",
] as const;

/**
 * O endereço das contas de uma empresa.
 *
 * **O símbolo tem de ser traduzido, e foi isto que faltou.** `googl.us` é a
 * convenção **interna** desta app — não é um ticker que exista em lado nenhum. O
 * Yahoo quer `GOOGL`, e Lisboa é `.LS` e não `.PT`. O serviço das cotações já
 * traduzia (`forSource`); o das contas pedia o símbolo em cru e levava com 404
 * em tudo. E um 404 lê-se como "esta empresa não existe", quando o que não
 * existia era o nome que lhe estávamos a chamar.
 *
 * Vive no domínio, e não no serviço, exactamente para haver um teste que
 * confirme que a tradução acontece antes de o pedido sair.
 */
export function urlDosFundamentais(simbolo: string, crumb?: string | null): string {
  const paraAFonte = forSource(simbolo, "yahoo");
  const p = new URLSearchParams({ modules: MODULOS_FUNDAMENTAIS.join(","), lang: "en-US" });
  if (crumb) p.set("crumb", crumb);
  return `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(paraAFonte)}?${p}`;
}

/* -------------------------------------------------------------------------- */

/** O Yahoo embrulha quase tudo em `{ raw, fmt }` — e às vezes em nada. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const r = (v as Record<string, unknown>).raw;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

/** Em milhares de milhões, que é a unidade em que estes números se leem. */
function mM(v: number | null): number | null {
  return v === null ? null : Math.round((v / 1_000_000_000) * 1000) / 1000;
}

function pct1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/**
 * Um rácio em percentagem, ou `null`.
 *
 * O denominador tem de ser **positivo**, e não apenas diferente de zero. Com
 * capital próprio negativo, `lucro / capital` devolve um número que se lê ao
 * contrário do que significa; com receita negativa, o mesmo. Nenhum desses
 * casos se denuncia no ecrã.
 */
function razaoPct(numerador: number | null, denominador: number | null): number | null {
  if (numerador === null || denominador === null || denominador <= 0) return null;
  return pct1((numerador / denominador) * 100);
}

/**
 * Um campo de texto, ou `null`.
 *
 * Uma cadeia vazia não é um setor: guardada como está, abria um grupo sem nome
 * no gráfico da carteira, indistinguível de um dado que não veio.
 */
function palavra(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Só a data, do carimbo de tempo que o Yahoo usa. */
function dia(v: unknown): string | null {
  const t = num(v);
  if (t === null || t <= 0) return null;
  const d = new Date(t * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function ano(v: unknown): number | null {
  const d = dia(v);
  return d ? Number(d.slice(0, 4)) : null;
}

function media(valores: (number | null)[]): number | null {
  const vs = valores.filter((v): v is number => v !== null);
  if (vs.length === 0) return null;
  return pct1(vs.reduce((s, v) => s + v, 0) / vs.length);
}

/**
 * Crescimento anual composto entre o primeiro e o último valor.
 *
 * Exige **ambos positivos**. Uma série que começa em prejuízo dá uma raiz de um
 * número negativo, e o que sai de lá é `NaN` ou um número sem sentido nenhum —
 * que depois entraria no DCF como se fosse o crescimento esperado.
 */
export function cagrPct(serie: (number | null)[]): number | null {
  const vs = serie.filter((v): v is number => v !== null);
  if (vs.length < 2) return null;
  const ini = vs[0]!;
  const fim = vs[vs.length - 1]!;
  if (ini <= 0 || fim <= 0) return null;
  const anos = vs.length - 1;
  return pct1((Math.pow(fim / ini, 1 / anos) - 1) * 100);
}

/* -------------------------------------------------------------------------- */

type Linha = Record<string, unknown>;

/**
 * As linhas de um mapa financeiro, indexadas pelo fim do período.
 *
 * `granularidade` decide a chave: no anual é o **ano**, porque um exercício
 * reexpresso volta a aparecer com outra data de fecho e são o mesmo ano; no
 * trimestral tem de ser a **data**, senão os quatro trimestres de 2025 colapsam
 * todos num só e a série fica com um ponto por ano onde devia ter quatro.
 *
 * Fica sempre o primeiro de cada chave: o Yahoo devolve do mais recente para o
 * mais antigo, e o mais recente é o que vale.
 */
function porPeriodo(linhas: unknown, granularidade: "ano" | "trimestre"): Map<string, Linha> {
  const m = new Map<string, Linha>();
  if (!Array.isArray(linhas)) return m;
  for (const l of linhas) {
    if (!l || typeof l !== "object") continue;
    const fim = dia((l as Linha).endDate);
    if (!fim) continue;
    const chave = granularidade === "ano" ? fim.slice(0, 4) : fim;
    if (!m.has(chave)) m.set(chave, l as Linha);
  }
  return m;
}

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2025-09-27" dá "2025" no anual e "set/25" no trimestral. Ver `rotulo`. */
function rotuloDoPeriodo(fim: string, granularidade: "ano" | "trimestre"): string {
  if (granularidade === "ano") return fim.slice(0, 4);
  const mes = MESES_CURTOS[Number(fim.slice(5, 7)) - 1] ?? fim.slice(5, 7);
  return `${mes}/${fim.slice(2, 4)}`;
}

/**
 * Uma série de períodos, com os rácios de cada um.
 *
 * É a mesma leitura para o anual e para o trimestral — e tem de ser a mesma, e
 * não uma cópia: uma segunda cópia deste bloco significava que o dia em que o
 * `capitalExpenditures` mudasse de sinal só uma das duas séries ficava certa, e
 * as duas continuavam a desenhar-se com o mesmo ar de facto.
 */
function lerSerie(
  dres: unknown,
  bals: unknown,
  cfs: unknown,
  granularidade: "ano" | "trimestre",
): AnoFundamental[] {
  const receitas = porPeriodo(dres, granularidade);
  const balancos = porPeriodo(bals, granularidade);
  const fluxos = porPeriodo(cfs, granularidade);

  const chaves = [...new Set([...receitas.keys(), ...balancos.keys(), ...fluxos.keys()])].sort();

  return chaves.map((chave) => {
    const dre = receitas.get(chave) ?? {};
    const bal = balancos.get(chave) ?? {};
    const cf = fluxos.get(chave) ?? {};
    const fim = dia(dre.endDate) ?? dia(bal.endDate) ?? dia(cf.endDate);

    const receita = num(dre.totalRevenue);
    const bruto = num(dre.grossProfit);
    const operacional = num(dre.operatingIncome);
    const liquido = num(dre.netIncome);
    // `ebit` só vem em algumas respostas; o resultado operacional é o mesmo
    // conceito para este efeito e vem sempre.
    const ebit = num(dre.ebit) ?? operacional;

    const ativo = num(bal.totalAssets);
    const passivoCorrente = num(bal.totalCurrentLiabilities);
    const ativoCorrente = num(bal.totalCurrentAssets);
    const capital = num(bal.totalStockholderEquity);
    const dividaCurta = num(bal.shortLongTermDebt);
    const dividaLonga = num(bal.longTermDebt);
    const dividaTotal =
      dividaCurta === null && dividaLonga === null ? null : (dividaCurta ?? 0) + (dividaLonga ?? 0);

    const operacoes = num(cf.totalCashFromOperatingActivities);
    // O investimento em ativo fixo vem **negativo** no Yahoo. Somar é subtrair.
    const capex = num(cf.capitalExpenditures);
    const fcf = operacoes === null ? null : operacoes + (capex ?? 0);

    const capitalEmpregue =
      ativo === null || passivoCorrente === null ? null : ativo - passivoCorrente;

    return {
      ano: Number(chave.slice(0, 4)),
      rotulo: rotuloDoPeriodo(fim ?? chave, granularidade),
      fim: fim ?? null,
      receitaBilioes: mM(receita),
      margemBrutaPct: razaoPct(bruto, receita),
      margemOperacionalPct: razaoPct(operacional, receita),
      margemLiquidaPct: razaoPct(liquido, receita),
      rocePct: razaoPct(ebit, capitalEmpregue),
      roePct: razaoPct(liquido, capital),
      dividaSobreCapitalPct: razaoPct(dividaTotal, capital),
      liquidezCorrente:
        ativoCorrente === null || passivoCorrente === null || passivoCorrente <= 0
          ? null
          : Math.round((ativoCorrente / passivoCorrente) * 100) / 100,
      fcfBilioes: mM(fcf),
      margemFcfPct: razaoPct(fcf, receita),
    };
  });
}

/**
 * Lê a resposta do `quoteSummary`.
 *
 * Nunca atira. Uma resposta vazia, um JSON partido ou um módulo em falta dão
 * campos a `null` e uma lista do que faltou — não uma excepção, e muito menos
 * um zero. Um zero num campo de dívida líquida muda o valor por ação e não se
 * distingue de uma empresa sem dívida.
 */
export function parseFundamentais(texto: string): Fundamentais {
  const vazio = (): Fundamentais => ({
    nome: null,
    moedaCotacao: null,
    moedaRelato: null,
    precoUnidade: null,
    fcfBilioes: null,
    acoesBilioes: null,
    dividaBilioes: null,
    caixaBilioes: null,
    setor: null,
    industria: null,
    tipoFonte: null,
    historico: [],
    trimestral: [],
    medias: {
      rocePct: null,
      margemOperacionalPct: null,
      margemLiquidaPct: null,
      margemFcfPct: null,
      crescimentoFcfPct: null,
      crescimentoReceitaPct: null,
      anos: 0,
    },
    estimativas: { crescimento1aPct: null, crescimento5aPct: null },
    datas: { resultados: null, dividendo: null, exDividendo: null },
    emFalta: ["a resposta da fonte não trouxe dados nenhuns"],
  });

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return vazio();
  }

  const raiz = corpo as Record<string, any>;
  const r = raiz?.quoteSummary?.result?.[0];
  if (!r || typeof r !== "object") return vazio();

  const price: Linha = r.price ?? {};
  const stats: Linha = r.defaultKeyStatistics ?? {};
  const fin: Linha = r.financialData ?? {};
  const perfil: Linha = r.assetProfile ?? r.summaryProfile ?? {};

  // A moeda da cotação vem em bruto e pode ser `GBp`: pence, não libras. É o
  // mesmo cem-vezes que já custou caro nas cotações, e a única diferença entre
  // as duas é a caixa da letra.
  const moedaBruta = typeof price.currency === "string" ? price.currency : null;
  const sub = moedaBruta ? moedaDeSubunidade(moedaBruta) : null;
  const moedaCotacao = sub ? sub.moeda : moedaBruta ? moedaBruta.toUpperCase() : null;
  const divisor = sub?.divisor ?? 1;

  const precoBruto = num(price.regularMarketPrice) ?? num(fin.currentPrice);
  const precoUnidade =
    precoBruto === null ? null : Math.round((precoBruto / divisor) * 10_000) / 10_000;

  const moedaRelato =
    typeof price.financialCurrency === "string"
      ? price.financialCurrency.toUpperCase()
      : typeof fin.financialCurrency === "string"
        ? (fin.financialCurrency as string).toUpperCase()
        : null;

  const historico = lerSerie(
    r.incomeStatementHistory?.incomeStatementHistory,
    r.balanceSheetHistory?.balanceSheetStatements,
    r.cashflowStatementHistory?.cashflowStatements,
    "ano",
  );
  const trimestral = lerSerie(
    r.incomeStatementHistoryQuarterly?.incomeStatementHistory,
    r.balanceSheetHistoryQuarterly?.balanceSheetStatements,
    r.cashflowStatementHistoryQuarterly?.cashflowStatements,
    "trimestre",
  );

  const medias: MediasHistoricas = {
    rocePct: media(historico.map((h) => h.rocePct)),
    margemOperacionalPct: media(historico.map((h) => h.margemOperacionalPct)),
    margemLiquidaPct: media(historico.map((h) => h.margemLiquidaPct)),
    margemFcfPct: media(historico.map((h) => h.margemFcfPct)),
    crescimentoFcfPct: cagrPct(historico.map((h) => h.fcfBilioes)),
    crescimentoReceitaPct: cagrPct(historico.map((h) => h.receitaBilioes)),
    anos: historico.length,
  };

  const tendencias: Linha[] = Array.isArray(r.earningsTrend?.trend) ? r.earningsTrend.trend : [];
  const tendencia = (periodo: string): number | null => {
    const t = tendencias.find((x) => x?.period === periodo);
    const g = t ? num(t.growth) : null;
    return g === null ? null : pct1(g * 100);
  };

  const cal = r.calendarEvents ?? {};
  const datas: DatasEmpresa = {
    resultados: dia(Array.isArray(cal.earnings?.earningsDate) ? cal.earnings.earningsDate[0] : null),
    dividendo: dia(cal.dividendDate),
    exDividendo: dia(cal.exDividendDate),
  };

  // O fluxo livre dos últimos doze meses vem do `financialData`; o do último
  // exercício fechado serve de reserva. São coisas diferentes e a de trás é a
  // pior — mas é melhor do que campo nenhum, e o ecrã diz sempre qual usou.
  const fcfTtm = num(fin.freeCashflow);
  const fcfUltimo = historico.length > 0 ? historico[historico.length - 1]!.fcfBilioes : null;
  const fcfBilioes = fcfTtm !== null ? mM(fcfTtm) : fcfUltimo;

  const acoes = num(stats.sharesOutstanding) ?? num(price.sharesOutstanding);
  const divida = num(fin.totalDebt);
  const caixa = num(fin.totalCash);

  const emFalta: string[] = [];
  if (fcfBilioes === null) emFalta.push("o fluxo de caixa livre");
  if (acoes === null) emFalta.push("as ações em circulação");
  if (divida === null) emFalta.push("a dívida");
  if (caixa === null) emFalta.push("a caixa");
  if (precoUnidade === null) emFalta.push("o preço");
  if (historico.length === 0) emFalta.push("o historial de contas");

  return {
    nome: typeof price.longName === "string" ? price.longName : typeof price.shortName === "string" ? price.shortName : null,
    moedaCotacao,
    moedaRelato,
    precoUnidade,
    fcfBilioes,
    acoesBilioes: mM(acoes),
    dividaBilioes: mM(divida),
    caixaBilioes: mM(caixa),
    setor: palavra(perfil.sector),
    industria: palavra(perfil.industry),
    tipoFonte: palavra(price.quoteType),
    historico,
    trimestral,
    medias,
    estimativas: {
      crescimento1aPct: tendencia("+1y"),
      crescimento5aPct: tendencia("+5y"),
    },
    datas,
    emFalta,
  };
}

/** O que uma série fez entre a primeira e a última leitura que tem. */
export interface TendenciaSerie {
  primeiro: number;
  ultimo: number;
  /** Variação absoluta, nas unidades da própria série. */
  variacao: number;
  /**
   * A mesma variação em percentagem, **quando ela quer dizer alguma coisa**.
   *
   * `null` quando o ponto de partida não é positivo. Uma margem que vai de −5%
   * para 3% melhorou 8 pontos; a divisão dá −160%, um número com sinal ao
   * contrário do que aconteceu. É a mesma recusa que o histórico do património
   * já faz com um líquido negativo.
   */
  variacaoPct: number | null;
  /** Quantas leituras entraram — as que faltam não contam nem se inventam. */
  pontos: number;
  /** Quantas leituras a fonte não trouxe, para o ecrã o poder dizer. */
  buracos: number;
}

/**
 * A tendência de uma série de indicadores.
 *
 * **Compara a primeira leitura com a última, e não com o que lá devia estar.**
 * Se faltar o ano do meio, ele não é interpolado: a variação é entre os dois
 * extremos que existem mesmo, e o número de buracos vai à parte para quem lê
 * saber sobre quanta coisa é que a conclusão assenta.
 *
 * `null` com menos de duas leituras: uma tendência de um ponto não é tendência.
 */
export function tendenciaDaSerie(valores: readonly (number | null)[]): TendenciaSerie | null {
  const presentes = valores.filter((v): v is number => v !== null);
  if (presentes.length < 2) return null;
  const primeiro = presentes[0]!;
  const ultimo = presentes[presentes.length - 1]!;
  const variacao = Math.round((ultimo - primeiro) * 1000) / 1000;
  return {
    primeiro,
    ultimo,
    variacao,
    variacaoPct: primeiro > 0 ? pct1(((ultimo - primeiro) / primeiro) * 100) : null,
    pontos: presentes.length,
    buracos: valores.length - presentes.length,
  };
}

/**
 * As moedas batem certo?
 *
 * Se a empresa relata em dólares e cota em euros, o valor por ação que sai do
 * DCF está em dólares e o preço a que se compara está em euros. Os dois números
 * têm o tamanho certo, a conta corre sem erro nenhum, e o veredicto está errado
 * por vinte por cento. Acontece em qualquer ADR.
 */
export function moedasBatem(f: Fundamentais): boolean {
  if (!f.moedaCotacao || !f.moedaRelato) return true;
  return f.moedaCotacao === f.moedaRelato;
}

/**
 * Cenários a partir do historial, para o formulário não nascer em suposições.
 *
 * O crescimento passado **não é** o crescimento futuro, e isto não finge que é:
 * é um ponto de partida com uma origem que se pode conferir na tabela ao lado.
 * O central é o histórico travado nos 20% (acima disso é quase sempre uma base
 * pequena a crescer, não um regime), o pessimista é metade e o otimista é o
 * histórico mais um quarto. A segunda fase é sempre mais lenta do que a
 * primeira, que é a única coisa de que se tem a certeza.
 */
export function cenariosDoHistorico(medias: MediasHistoricas): {
  baixo: [number, number];
  medio: [number, number];
  alto: [number, number];
} | null {
  const base = medias.crescimentoFcfPct ?? medias.crescimentoReceitaPct;
  if (base === null || base <= 0) return null;
  const central = Math.min(Math.round(base * 10) / 10, 20);
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    baixo: [r(central / 2), r(central / 3)],
    medio: [central, r(central * 0.7)],
    alto: [r(central * 1.25), r(central * 0.9)],
  };
}
