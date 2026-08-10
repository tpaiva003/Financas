/**
 * A evolução do património ao longo do tempo.
 *
 * **Porque é que isto precisa de uma tabela nova.** O património da app é uma
 * fotografia: cada bem tem o valor de hoje e mais nada. Não há como reconstruir
 * o passado — o depósito que hoje tem 12 mil não sabe que teve 8 mil no ano
 * passado, e a casa registada em 2019 não guardou o que valia então. As
 * despesas dão-se a reconstruir porque são movimentos datados; um saldo não.
 *
 * Por isso o histórico **começa vazio e enche-se para a frente**: guarda-se uma
 * fotografia por dia e o gráfico vai crescendo. Não há aqui nada retroativo, e
 * dizer isso é melhor do que desenhar uma linha reta inventada até ao princípio
 * do ano.
 *
 * **A percentagem não se calcula a partir de um património negativo.** Ir de
 * -50 mil para -10 mil é uma melhoria de 40 mil, e a divisão dá -80% — um sinal
 * ao contrário do que aconteceu. Quem começa com dívida a mais do que bens vê a
 * variação em euros e não vê percentagem nenhuma, que é a única leitura que não
 * engana.
 *
 * Lógica pura, sem rede.
 */

/** Uma fotografia do património num dia. */
export interface NetWorthSnapshot {
  /** "AAAA-MM-DD". */
  onDate: string;
  assetsCents: number;
  debtsCents: number;
  netCents: number;
  /** Reconstruído em vez de medido. Ver `NetWorthPoint.estimado`. */
  estimado?: boolean;
}

export interface NetWorthPoint extends NetWorthSnapshot {
  /** "ago/26", para o eixo. */
  label: string;
  /** Variação face ao ponto anterior. `null` no primeiro. */
  changeCents: number | null;
  /**
   * Este ponto foi **reconstruído**, não medido.
   *
   * Nunca se apaga esta distinção. Os investimentos reconstroem-se a sério
   * (há movimentos datados e cotações), mas as contas e os imóveis não têm
   * passado nenhum — entram ao valor de hoje. Um gráfico que misture as duas
   * coisas sem dizer qual é qual mostra o saldo bancário de hoje em 2023 com
   * ar de facto.
   */
  estimado?: boolean;
}

export interface NetWorthSeries {
  points: NetWorthPoint[];
  /** Variação entre o primeiro e o último ponto. */
  changeCents: number | null;
  /**
   * A mesma variação em percentagem, quando ela quer dizer alguma coisa.
   *
   * `null` quando o ponto de partida não é positivo — ver o cabeçalho.
   */
  changePct: number | null;
  /** Quantos dias a série cobre, do primeiro ao último ponto. */
  days: number;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-08-09" dá "ago/26". */
export function rotuloDoMes(onDate: string): string {
  const [y, m] = onDate.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  const nome = MESES[mi] ?? m ?? "";
  return `${nome}/${(y ?? "").slice(2)}`;
}

/** Dias inteiros entre duas datas "AAAA-MM-DD". */
function diasEntre(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Limpar as fotografias que vêm da base de dados.
 *
 * Ordena por data, e quando há mais do que uma no mesmo dia fica com a última
 * da lista — que é a mais recente, porque quem lê já as traz por ordem. Duas
 * fotografias do mesmo dia no gráfico davam dois pontos sobrepostos e uma
 * variação de zero pelo meio, que se lê como um dia parado.
 */
export function normalizeSnapshots(raw: readonly unknown[]): NetWorthSnapshot[] {
  const porDia = new Map<string, NetWorthSnapshot>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const onDate = typeof r.onDate === "string" ? r.onDate.slice(0, 10) : "";
    if (!DATA.test(onDate)) continue;
    const assetsCents = numero(r.assetsCents);
    const debtsCents = numero(r.debtsCents);
    if (assetsCents === null || debtsCents === null) continue;
    // O líquido é derivado: guardá-lo é conveniente, acreditar nele não. Se o
    // que está gravado não bater certo com as duas parcelas, manda a conta.
    porDia.set(onDate, {
      onDate,
      assetsCents,
      debtsCents,
      netCents: assetsCents - debtsCents,
      estimado: r.estimado === true,
    });
  }

  return [...porDia.values()].sort((a, b) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
}

/**
 * Uma fotografia por mês: a última de cada mês.
 *
 * Um ponto por dia num ano dá trezentos e sessenta e cinco pontos num gráfico
 * com a largura de um telemóvel. A última de cada mês é a que se compara com
 * um extrato, e é a convenção que toda a gente já tem na cabeça.
 */
export function porMes(snapshots: readonly NetWorthSnapshot[]): NetWorthSnapshot[] {
  const ultimo = new Map<string, NetWorthSnapshot>();
  for (const s of snapshots) ultimo.set(s.onDate.slice(0, 7), s);
  return [...ultimo.values()];
}

/**
 * A série para o gráfico, com as variações já calculadas.
 *
 * `granularidade` escolhe entre um ponto por dia e um por mês. Nada é
 * interpolado: se faltarem meses no meio, faltam mesmo, e o gráfico mostra os
 * pontos que existem em vez de inventar a linha entre eles.
 */
export function buildNetWorthSeries(
  snapshots: readonly NetWorthSnapshot[],
  granularidade: "dia" | "mes" = "mes",
): NetWorthSeries {
  const base = granularidade === "mes" ? porMes(snapshots) : [...snapshots];

  const points: NetWorthPoint[] = base.map((s, i) => ({
    ...s,
    label: rotuloDoMes(s.onDate),
    changeCents: i === 0 ? null : s.netCents - base[i - 1]!.netCents,
  }));

  if (points.length < 2) {
    return { points, changeCents: null, changePct: null, days: 0 };
  }

  const primeiro = points[0]!;
  const ultimo = points[points.length - 1]!;
  const changeCents = ultimo.netCents - primeiro.netCents;

  return {
    points,
    changeCents,
    /**
     * Só há percentagem quando o ponto de partida é positivo. A partir de zero
     * a divisão não existe; a partir de um número negativo dá o sinal ao
     * contrário do que aconteceu. Um número errado com ar de resposta é pior do
     * que resposta nenhuma.
     */
    changePct: primeiro.netCents > 0 ? (changeCents / primeiro.netCents) * 100 : null,
    days: diasEntre(primeiro.onDate, ultimo.onDate),
  };
}

/* ------------------------------------------------------------------------- */
/* Reconstruir o passado                                                      */
/* ------------------------------------------------------------------------- */

/**
 * **O que se reconstrói a sério, e o que é assumido.**
 *
 * Um investimento tem movimentos datados e cotações: quantas unidades havia em
 * Março de 2024 sabe-se, e a que preço fechavam também. Isso é história a
 * sério.
 *
 * Uma conta bancária e um imóvel não têm passado nenhum guardado — só sabem o
 * valor de hoje. Entram na reconstrução **ao valor de hoje**, o que quer dizer
 * que a linha do passado mostra o saldo de hoje em 2023. O Tiago pediu isto
 * sabendo-o; o que não se faz é deixar de o dizer. Todos os pontos
 * reconstruídos vêm marcados com `estimado` e o gráfico desenha-os a tracejado.
 *
 * **O câmbio é o de hoje.** Uma cotação em dólares converte-se pela razão entre
 * o fecho da data e o fecho de hoje, aplicada ao preço em euros de hoje — o que
 * faz a moeda desaparecer da conta e evita ir buscar uma taxa a cada mês. O
 * preço fica certo em dólares e o câmbio fica congelado: num período em que o
 * euro se mexeu muito, a diferença aparece. É a razão de isto ser uma
 * estimativa e não uma medição.
 */
export interface AtivoReconstruivel {
  /** Movimentos datados, com o efeito em unidades (negativo numa venda). */
  movimentos: { date: string; unidades: number }[];
  /** Fechos conhecidos, em euros por unidade. Ordenados ou não. */
  precos: { date: string; closeEurCents: number }[];
  /** O que se usa quando não há cotação nenhuma até àquela data. */
  custoUnitarioCents: number | null;
}

/** Uma dívida que amortiza, para se poder recuar o saldo. */
export interface DividaReconstruivel {
  balanceCents: number;
  annualRatePct: number;
  monthlyPaymentCents: number;
}

/** O último dia do mês de uma data "AAAA-MM-DD". */
export function fimDoMes(onDate: string): string {
  const y = Number(onDate.slice(0, 4));
  const m = Number(onDate.slice(5, 7));
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${onDate.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

/** Recua um mês, ficando no fim desse mês. */
function mesAnterior(onDate: string): string {
  const y = Number(onDate.slice(0, 4));
  const m = Number(onDate.slice(5, 7));
  const anterior = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  return fimDoMes(anterior);
}

/** Unidades detidas numa data, a partir dos movimentos. */
export function unidadesEm(
  movimentos: readonly { date: string; unidades: number }[],
  onDate: string,
): number {
  let u = 0;
  for (const m of movimentos) if (m.date <= onDate) u += m.unidades;
  // Vender mais do que se tem é um erro de registo, não uma posição negativa.
  return u > 0 ? u : 0;
}

/** O último fecho conhecido até uma data. `null` se não houver nenhum. */
export function precoEm(
  precos: readonly { date: string; closeEurCents: number }[],
  onDate: string,
): number | null {
  let melhor: { date: string; closeEurCents: number } | null = null;
  for (const p of precos) {
    if (p.date > onDate) continue;
    if (!melhor || p.date > melhor.date) melhor = p;
  }
  return melhor?.closeEurCents ?? null;
}

/**
 * O saldo de um crédito num mês passado.
 *
 * A amortização anda para a frente com `saldo' = saldo(1+i) - prestação`. Para
 * recuar inverte-se: `saldo = (saldo' + prestação) / (1+i)`. Usa-se a taxa de
 * hoje em todo o percurso, o que é falso num crédito que já mudou de taxa — e é
 * mais uma razão para isto se chamar estimativa.
 */
export function saldoHaMeses(divida: DividaReconstruivel, meses: number): number {
  if (meses <= 0) return divida.balanceCents;
  const i = divida.annualRatePct / 100 / 12;
  let saldo = divida.balanceCents;
  for (let k = 0; k < meses; k++) {
    saldo = i === 0 ? saldo + divida.monthlyPaymentCents : (saldo + divida.monthlyPaymentCents) / (1 + i);
    // Um crédito não pode ter sido maior do que o mundo: se a conta disparar, é
    // sinal de que a prestação ou a taxa não batem certo, e pára-se.
    if (!Number.isFinite(saldo) || saldo > 1_000_000_000_00) return divida.balanceCents;
  }
  return Math.round(saldo);
}

/**
 * Reconstruir a evolução do património, mês a mês, para trás.
 *
 * Todos os pontos saem marcados como `estimado`. Ver o cabeçalho de
 * `AtivoReconstruivel` para o que é medido e o que é assumido.
 */
export function reconstruirHistorico(input: {
  /** "AAAA-MM-DD". */
  hoje: string;
  /** Quantos meses para trás. */
  meses: number;
  investimentos: readonly AtivoReconstruivel[];
  dividas: readonly DividaReconstruivel[];
  /** Bens sem passado (contas, imóveis): contam pelo valor de hoje. */
  outrosAtivosCents: number;
  /** Dívidas sem plano: contam pelo valor de hoje. */
  outrasDividasCents: number;
}): NetWorthSnapshot[] {
  const pontos: NetWorthSnapshot[] = [];
  const meses = Math.max(0, Math.min(Math.round(input.meses), 120));

  /**
   * Só se reconstrói quando há mesmo alguma coisa a reconstruir.
   *
   * Sem investimentos com movimentos e sem dívidas com plano, todos os pontos
   * seriam o valor de hoje repetido para trás — uma linha horizontal a afirmar
   * que o património esteve parado meses a fio. É a versão mais convincente da
   * mentira que esta funcionalidade já assume ter: mais vale não a desenhar.
   */
  const temMovimentos = input.investimentos.some((a) => a.movimentos.length > 0);
  if (!temMovimentos && input.dividas.length === 0) return [];

  // A data mais antiga em que há movimentos: antes disso não havia carteira, e
  // desenhar meses com a carteira a zero e a casa ao valor de hoje era pior do
  // que não desenhar nada.
  let maisAntigo: string | null = null;
  for (const a of input.investimentos) {
    for (const m of a.movimentos) {
      if (!maisAntigo || m.date < maisAntigo) maisAntigo = m.date;
    }
  }

  let data = mesAnterior(input.hoje);
  for (let k = 1; k <= meses; k++) {
    if (maisAntigo && data < maisAntigo) break;

    let investimentosCents = 0;
    for (const a of input.investimentos) {
      const unidades = unidadesEm(a.movimentos, data);
      if (unidades <= 0) continue;
      const preco = precoEm(a.precos, data) ?? a.custoUnitarioCents;
      // Sem cotação nem custo não se inventa preço nenhum: a posição não conta.
      if (preco === null) continue;
      investimentosCents += Math.round(unidades * preco);
    }

    let dividasCents = input.outrasDividasCents;
    for (const d of input.dividas) dividasCents += saldoHaMeses(d, k);

    const assetsCents = investimentosCents + input.outrosAtivosCents;
    pontos.push({
      onDate: data,
      assetsCents,
      debtsCents: dividasCents,
      netCents: assetsCents - dividasCents,
      estimado: true,
    });

    data = mesAnterior(data);
  }

  return pontos.reverse();
}

/**
 * Junta o que foi reconstruído com o que foi mesmo medido.
 *
 * **O medido ganha sempre.** Um dia que tenha fotografia a sério não é
 * substituído por uma estimativa, nem sequer parcialmente: é o único ponto
 * daquele mês em que se pode confiar, e deixá-lo perder para um cálculo seria
 * trocar um facto por uma conta.
 */
export function juntarHistorico(
  reconstruido: readonly NetWorthSnapshot[],
  medido: readonly NetWorthSnapshot[],
): NetWorthSnapshot[] {
  const porMesMedido = new Set(medido.map((s) => s.onDate.slice(0, 7)));
  const sobrantes = reconstruido.filter((s) => !porMesMedido.has(s.onDate.slice(0, 7)));
  return [...sobrantes, ...medido].sort((a, b) =>
    a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0,
  );
}
