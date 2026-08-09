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
}

export interface NetWorthPoint extends NetWorthSnapshot {
  /** "ago/26", para o eixo. */
  label: string;
  /** Variação face ao ponto anterior. `null` no primeiro. */
  changeCents: number | null;
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
