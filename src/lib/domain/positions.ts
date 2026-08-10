/**
 * Posições a partir de movimentos datados.
 *
 * Uma posição escrita à mão ("tenho 100 unidades a 92 EUR") diz o que se tem
 * hoje e não diz nada sobre como lá se chegou. Sem as datas das compras não há
 * forma de responder à pergunta que interessa: **quanto rendeu o meu dinheiro**,
 * sabendo que ele foi entrando aos poucos.
 *
 * Com movimentos datados, a posição deixa de ser escrita e passa a ser
 * calculada. Duas regras que evitam os erros clássicos:
 *
 * 1. **Os movimentos substituem a posição manual, nunca se somam a ela.** Quem
 *    registou "100 unidades" à mão e depois lança as três compras que fizeram
 *    essas 100 unidades não pode acabar com 200. Enquanto houver movimentos,
 *    mandam eles; se forem todos apagados, volta a valer o que estava escrito.
 * 2. **Custo médio ponderado**, não FIFO. É o que as corretoras mostram e o que
 *    torna o custo unitário comparável com a cotação. Para efeitos fiscais em
 *    Portugal a regra é FIFO, e este número não serve para o IRS.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { CashFlow, ValuePoint } from "./returns";
import { priceOn, xirr } from "./returns";

export type TradeKind = "compra" | "venda" | "dividendo" | "custo";

export const TRADE_KIND_LABELS: Record<TradeKind, string> = {
  compra: "Compra",
  venda: "Venda",
  dividendo: "Dividendo",
  custo: "Comissão ou imposto",
};

export interface Trade {
  id: string;
  /** "AAAA-MM-DD". */
  date: string;
  kind: TradeKind;
  /** Unidades transacionadas (compras e vendas). */
  quantity?: number | null;
  /** Preço por unidade, em cêntimos de euro. */
  unitPriceCents?: number | null;
  /** Dinheiro movimentado, em cêntimos de euro, sempre positivo. */
  amountCents: number;
}

export interface Position {
  /** Unidades que restam. */
  quantity: number;
  /** Custo do que ainda se tem, em cêntimos. */
  costCents: number;
  /** Custo médio por unidade, em cêntimos. */
  unitCostCents: number | null;
  /** Dinheiro que entrou na posição: compras mais comissões. */
  investedCents: number;
  /** Dinheiro que saiu por vendas. */
  proceedsCents: number;
  dividendsCents: number;
  /** Ganho já realizado: vendas menos o custo do que foi vendido. */
  realizedGainCents: number;
  /** Fluxos datados, prontos para a TIR. */
  flows: CashFlow[];
  firstDate: string | null;
  lastDate: string | null;
  /** Venderam-se mais unidades do que as que havia: as contas não fecham. */
  oversold: boolean;
}

const EMPTY: Position = {
  quantity: 0,
  costCents: 0,
  unitCostCents: null,
  investedCents: 0,
  proceedsCents: 0,
  dividendsCents: 0,
  realizedGainCents: 0,
  flows: [],
  firstDate: null,
  lastDate: null,
  oversold: false,
};

/** Quanto dinheiro um movimento representa, com o sinal do ponto de vista da carteira. */
export function tradeAmountCents(t: Trade): number {
  // Quando o valor não vem escrito, sai de unidades x preço. É o caso dos
  // ficheiros de corretora que trazem as duas colunas e não o total.
  if (t.amountCents) return Math.abs(Math.round(t.amountCents));
  const qty = t.quantity ?? 0;
  const price = t.unitPriceCents ?? 0;
  return Math.abs(Math.round(qty * price));
}

/**
 * A ordem por que os movimentos são processados.
 *
 * Está aqui, e não em linha, porque **dois sítios contam a mesma posição**: o
 * `buildPosition` e o `positionValuePoints`. Se cada um ordenasse à sua maneira,
 * a quantidade que o segundo vê num dado dia deixava de ser a que o primeiro
 * calculou, e a rentabilidade ponderada no tempo passava a discordar do custo
 * médio sem que nada se queixasse.
 */
export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // No mesmo dia, primeiro o que entra e só depois o que sai.
    //
    // O desempate era `a.id.localeCompare(b.id)`, e os ids são UUID: ou seja, à
    // sorte. Uma compra e uma venda do mesmo produto no mesmo dia — que é o que
    // acontece quando a corretora parte uma ordem — davam custo médio e
    // mais-valia realizada diferentes conforme o sorteio, sem sequer levantar o
    // aviso de `oversold`. Um número errado sem aviso é o pior que esta app
    // pode fazer.
    //
    // Não se pode vender o que ainda não se comprou, por isso a compra vem
    // primeiro: é a única ordem que não inventa uma venda a descoberto que
    // nunca existiu. Empates dentro do mesmo sentido ficam pelo id, que aí já
    // não muda conta nenhuma.
    const peso = (k: Trade["kind"]) => (k === "compra" ? 0 : k === "venda" ? 1 : 2);
    const pa = peso(a.kind);
    const pb = peso(b.kind);
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

export function buildPosition(trades: Trade[]): Position {
  if (trades.length === 0) return EMPTY;

  const sorted = sortTrades(trades);

  let quantity = 0;
  let costCents = 0;
  let investedCents = 0;
  let proceedsCents = 0;
  let dividendsCents = 0;
  let realizedGainCents = 0;
  let oversold = false;
  const flows: CashFlow[] = [];

  for (const t of sorted) {
    const amount = tradeAmountCents(t);
    const qty = Math.abs(t.quantity ?? 0);

    switch (t.kind) {
      case "compra": {
        quantity += qty;
        costCents += amount;
        investedCents += amount;
        flows.push({ date: t.date, amountCents: amount });
        break;
      }
      case "venda": {
        // Custo médio à data da venda: é o que sai da posição com as unidades.
        const avg = quantity > 0 ? costCents / quantity : 0;
        const sold = Math.min(qty, quantity);
        if (qty > quantity) oversold = true;
        const costOfSold = Math.round(avg * sold);
        quantity -= sold;
        costCents -= costOfSold;
        proceedsCents += amount;
        realizedGainCents += amount - costOfSold;
        flows.push({ date: t.date, amountCents: -amount });
        break;
      }
      case "dividendo": {
        // Não mexe no custo: é rendimento, não é devolução de capital.
        dividendsCents += amount;
        realizedGainCents += amount;
        flows.push({ date: t.date, amountCents: -amount });
        break;
      }
      case "custo": {
        // Comissões e impostos são dinheiro que se pôs e não comprou unidades.
        costCents += amount;
        investedCents += amount;
        flows.push({ date: t.date, amountCents: amount });
        break;
      }
    }
  }

  // A posição pode fechar a zero com cêntimos de sobra por arredondamento.
  if (quantity <= 0) {
    quantity = 0;
    costCents = 0;
  }

  return {
    quantity,
    costCents,
    unitCostCents: quantity > 0 ? Math.round(costCents / quantity) : null,
    investedCents,
    proceedsCents,
    dividendsCents,
    realizedGainCents,
    flows,
    firstDate: sorted[0]!.date,
    lastDate: sorted.at(-1)!.date,
    oversold,
  };
}

export interface DerivedPosition {
  quantity: number | null;
  unitCostCents: number | null;
  /** A posição vem dos movimentos e não do que foi escrito à mão. */
  derived: boolean;
  /** A posição calculada, quando há movimentos. */
  position: Position | null;
}

/**
 * A posição a usar para um ativo: a dos movimentos, se houver, senão a manual.
 *
 * É aqui que vive a regra de não duplicar. Quem escreveu "100 unidades" à mão e
 * depois lança as três compras que fizeram essas 100 unidades tem de continuar
 * com 100, não com 200. E apagar os movimentos devolve o que estava escrito, em
 * vez de deixar o ativo a zero: a entrada manual nunca é reescrita por trás.
 */
export function derivePosition(
  asset: { quantity?: number | null; unitCostCents?: number | null },
  trades: Trade[],
): DerivedPosition {
  if (trades.length === 0) {
    return {
      quantity: asset.quantity ?? null,
      unitCostCents: asset.unitCostCents ?? null,
      derived: false,
      position: null,
    };
  }
  const position = buildPosition(trades);
  return {
    quantity: position.quantity,
    unitCostCents: position.unitCostCents,
    derived: true,
    position,
  };
}

export interface PositionReturn {
  /** O que a posição vale hoje, em cêntimos. */
  currentValueCents: number;
  /** Valorização ainda por realizar. */
  unrealizedGainCents: number | null;
  /** Tudo somado: valorização, mais-valias realizadas e dividendos. */
  totalGainCents: number | null;
  /** Rentabilidade simples sobre o investido, sem contar com o tempo. */
  simpleReturnPct: number | null;
  /**
   * TIR anualizada: a taxa que o dinheiro rendeu, tendo em conta quando entrou.
   *
   * É a resposta certa para uma carteira com reforços. A rentabilidade simples
   * trata um euro metido o mês passado como igual a um euro metido há cinco
   * anos, e isso empola ou afunda o número consoante os reforços.
   */
  annualPct: number | null;
}

export function buildPositionReturn(
  position: Position,
  currentUnitPriceCents: number | null | undefined,
  today: string,
): PositionReturn {
  // Sem cotação, a posição vale o que custou: melhor do que inventar ganho.
  const priced = currentUnitPriceCents !== null && currentUnitPriceCents !== undefined;
  const currentValueCents = priced
    ? Math.round(position.quantity * currentUnitPriceCents)
    : position.costCents;

  const unrealizedGainCents = priced ? currentValueCents - position.costCents : null;
  const totalGainCents =
    unrealizedGainCents === null ? null : unrealizedGainCents + position.realizedGainCents;

  return {
    currentValueCents,
    unrealizedGainCents,
    totalGainCents,
    simpleReturnPct:
      totalGainCents === null || position.investedCents <= 0
        ? null
        : (totalGainCents / position.investedCents) * 100,
    annualPct:
      position.flows.length === 0 ? null : xirr(position.flows, currentValueCents, today),
  };
}

/**
 * As fotografias de valor da posição, para a rentabilidade ponderada no tempo.
 *
 * **Porquê.** A TIR responde a "quanto rendeu o MEU dinheiro" e depende de
 * quando ele entrou. A TWR responde a outra coisa — "o investimento foi bom?" —
 * e para isso tem de anular o efeito dos reforços. Não se consegue anular esse
 * efeito só com os fluxos: é preciso saber **quanto valia a posição em cada
 * momento em que entrou ou saiu dinheiro**, e isso exige cotações históricas.
 *
 * **Dois pontos por dia de movimento, e a razão é o coração disto.** A
 * `timeWeightedReturn` fecha cada troço com `valor / (valor anterior + fluxo)`,
 * ou seja, assume que o dinheiro entrou no **início** do troço. Num dia em que
 * há crescimento *e* reforço, juntar as duas coisas num só ponto faz o reforço
 * parecer que esteve investido o período todo, e o crescimento desse período
 * aparece diluído. Com 10 unidades compradas a 100,00 que valem 200,00 quando se
 * reforçam mais 90, o troço rendeu 100% e a conta de um ponto só devolvia 5%.
 *
 * Por isso cada data de movimento dá:
 *  1. um ponto que **fecha** o troço anterior — as unidades que já lá estavam ao
 *     preço de hoje, sem fluxo nenhum;
 *  2. um ponto que **aplica** o movimento — a posição depois dele, com o fluxo.
 *
 * O segundo nunca inventa rentabilidade: o valor sobe exatamente o que entrou.
 * E é isto que faz um dividendo contar como ganho (sai dinheiro sem sair
 * unidades) e uma venda a preço de mercado não contar como nada.
 *
 * **Devolve `null` se faltar o preço de algum dia.** Não se estima, não se
 * interpola e não se salta o ponto: qualquer uma dessas saídas dá um número
 * plausível e errado, que é a pior coisa que esta app pode mostrar.
 *
 * `prices` são preços por unidade **em cêntimos de euro**. Uma série na moeda de
 * origem misturada com movimentos em euros daria uma rentabilidade inventada,
 * por isso a conversão é de quem chama e tem de estar feita antes de aqui chegar.
 */
export function positionValuePoints(
  trades: Trade[],
  prices: Record<string, number>,
  today: string,
  currentValueCents: number,
): ValuePoint[] | null {
  if (trades.length === 0) return null;

  const sorted = sortTrades(trades);
  const points: ValuePoint[] = [];
  let quantity = 0;

  // Os movimentos agrupados por dia, pela ordem em que já foram ordenados.
  const porDia = new Map<string, Trade[]>();
  for (const t of sorted) porDia.set(t.date, [...(porDia.get(t.date) ?? []), t]);

  for (const [dia, doDia] of porDia) {
    const preco = priceOn(prices, dia);
    // Um dia sem cotação não se adivinha. Ver o comentário do cabeçalho.
    if (preco === null || preco <= 0) return null;

    // (1) Fecha o troço anterior: só o que já cá estava, ao preço de hoje. No
    // primeiro dia não há troço para fechar — ainda não havia nada investido.
    if (points.length > 0) {
      points.push({ date: dia, valueCents: Math.round(quantity * preco), flowCents: 0 });
    }

    // (2) Aplica o movimento do dia.
    let fluxo = 0;
    for (const t of doDia) {
      const amount = tradeAmountCents(t);
      const qty = Math.abs(t.quantity ?? 0);
      switch (t.kind) {
        case "compra":
          quantity += qty;
          fluxo += amount;
          break;
        case "venda":
          // Nunca abaixo de zero: vender a mais é um erro de dados, e uma
          // quantidade negativa punha a posição a valer valores negativos.
          quantity = Math.max(0, quantity - qty);
          fluxo -= amount;
          break;
        case "dividendo":
          // Não mexe na quantidade: é dinheiro que saiu do investimento para o
          // bolso, e conta como retorno, não como desinvestimento.
          fluxo -= amount;
          break;
        case "custo":
          // Comissões e impostos são dinheiro posto que não comprou unidades.
          fluxo += amount;
          break;
      }
    }
    points.push({ date: dia, valueCents: Math.round(quantity * preco), flowCents: fluxo });
  }

  // Hoje, com o valor atual. Se o último movimento é de hoje, fica o valor
  // atual: pode já haver preço mais recente do que o fecho aplicado acima.
  const ultimo = points[points.length - 1]!;
  if (ultimo.date === today) {
    ultimo.valueCents = currentValueCents;
  } else {
    points.push({ date: today, valueCents: currentValueCents, flowCents: 0 });
  }

  // Um ponto só não chega para medir crescimento nenhum.
  return points.length >= 2 ? points : null;
}

/**
 * O que uma compra em concreto valeu a pena, até agora.
 *
 * **Porque não é FIFO.** A posição desta app é a **custo médio** (ver o
 * cabeçalho): dizer aqui que uma venda consumiu esta compra e não aquela era
 * pôr duas contabilidades diferentes no mesmo ecrã, e a de baixo contradizia a
 * de cima. O que isto responde é outra coisa, e mais útil: *"comprar a este
 * preço, naquele dia, foi bom negócio?"*
 *
 * Por isso conta **as unidades desse movimento ao preço de hoje**, mesmo que
 * entretanto tenham sido vendidas. Não é a mais-valia realizada e não serve
 * para o IRS — que em Portugal é FIFO. É a leitura de cada entrada.
 *
 * Numa venda, a conta é ao contrário: o que se recebeu contra o que essas
 * unidades valeriam hoje. Positivo quer dizer que se vendeu acima do preço de
 * agora.
 */
export interface LucroDoMovimento {
  /** O dinheiro que este movimento moveu. */
  amountCents: number;
  /** O que essas unidades valem hoje. */
  nowCents: number;
  /** A diferença, no sentido que faz sentido para o tipo de movimento. */
  gainCents: number;
  /** A mesma diferença em percentagem. `null` quando não há base. */
  gainPct: number | null;
  /** Uma venda lê-se ao contrário de uma compra. */
  kind: "compra" | "venda";
}

export function lucroDoMovimento(
  t: Pick<Trade, "kind" | "quantity" | "amountCents">,
  currentUnitPriceCents: number | null | undefined,
): LucroDoMovimento | null {
  if (t.kind !== "compra" && t.kind !== "venda") return null;
  const q = typeof t.quantity === "number" ? Math.abs(t.quantity) : 0;
  if (q <= 0) return null;
  if (typeof currentUnitPriceCents !== "number" || currentUnitPriceCents <= 0) return null;

  const amountCents = Math.abs(t.amountCents);
  if (amountCents <= 0) return null;
  const nowCents = Math.round(q * currentUnitPriceCents);

  // Numa compra ganha-se se hoje vale mais do que se pagou. Numa venda ganha-se
  // se se recebeu mais do que valeria hoje — vender antes de uma descida é
  // ganhar, e o sinal tem de dizer isso.
  const gainCents = t.kind === "compra" ? nowCents - amountCents : amountCents - nowCents;

  return {
    amountCents,
    nowCents,
    gainCents,
    gainPct: amountCents > 0 ? (gainCents / amountCents) * 100 : null,
    kind: t.kind,
  };
}

/**
 * Os movimentos batem certo com as cotações?
 *
 * **Porque é que isto tem de existir.** Uma corretora regista um desdobramento
 * (*split*) como uma venda e uma compra no mesmo dia, pelo mesmo dinheiro: sai
 * 1 unidade, entram 20, e o dinheiro não se mexe. A app leu isso como negócios
 * a sério. O troço da TWR nesse dia fica `20p / 1p` = **×20 exactos**,
 * independentemente de qualquer preço, e o ecrã mostrou +4969,9% num
 * investimento que fez +114%.
 *
 * Ao mesmo tempo, a série de cotações do Yahoo vem **ajustada a splits**: as
 * unidades gravadas são pré-split e os preços são pós-split. É essa
 * incoerência que se procura aqui — e ela é visível sem se saber nada sobre
 * splits: o dinheiro por unidade daquele dia não bate certo com o fecho do
 * mesmo dia.
 *
 * **O limite é largo de propósito.** Uma execução longe do fecho e as comissões
 * embutidas no montante andam nos poucos por cento; um split anda em fatores de
 * 1,5, 2, 10 ou 20. Com 1,35 apanham-se os splits de 3:2 para cima. Um 5:4
 * (1,25) passa — e é melhor deixar passar um caso raro do que recusar a
 * rentabilidade a quem comprou com um limite mal colocado.
 *
 * Devolve o problema por extenso, ou `null` quando está tudo coerente.
 */
const LIMITE_COERENCIA = 1.35;

export function incoerenciaEntreMovimentosECotacoes(
  trades: Trade[],
  prices: Record<string, number>,
): string | null {
  for (const t of sortTrades(trades)) {
    if (t.kind !== "compra" && t.kind !== "venda") continue;
    const qty = Math.abs(t.quantity ?? 0);
    if (qty <= 0) continue;

    const doDia = priceOn(prices, t.date);
    if (doDia === null || doDia <= 0) continue;

    const implicito = Math.abs(tradeAmountCents(t)) / qty;
    if (implicito <= 0) continue;

    const razao = implicito / doDia;
    if (razao > LIMITE_COERENCIA || razao < 1 / LIMITE_COERENCIA) {
      const vezes = razao >= 1 ? razao : 1 / razao;
      const sentido = razao >= 1 ? "acima" : "abaixo";
      return (
        `O movimento de ${t.date} tem um preço por unidade cerca de ${Math.round(vezes)}× ` +
        `${sentido} da cotação desse dia. Parece um desdobramento (split) por tratar — ` +
        `sem isso, a rentabilidade deste investimento não é fiável.`
      );
    }
  }
  return null;
}
