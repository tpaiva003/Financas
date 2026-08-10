/**
 * Rentabilidade ponderada no tempo (TWR) de um investimento.
 *
 * A app já mostrava a TIR, que responde a **"quanto rendeu o meu dinheiro"** e
 * depende de quando ele entrou. Faltava a outra pergunta, que é a que se faz
 * quando se quer saber se a *escolha* foi boa: **"o investimento foi bom?"**.
 * Quem reforçou pesado mesmo antes de uma queda tem uma TIR má e pode ter
 * escolhido bem; quem teve sorte no timing tem uma TIR boa sem mérito nenhum.
 *
 * O cálculo em si já existia e estava testado (`timeWeightedReturn`), mas nunca
 * tinha sido ligado a nada — faltava-lhe o que é caro: **saber quanto valia a
 * posição em cada dia de movimento**, o que exige cotações históricas e, quando
 * a série não é em euros, uma taxa de câmbio por cada um desses dias.
 *
 * É por isso que isto é um serviço e não domínio: tem de ir à rede. O cálculo
 * continua todo em `positions.ts` e `returns.ts`, puro e testado.
 */

import {
  annualize,
  incoerenciaEntreMovimentosECotacoes,
  positionValuePoints,
  timeWeightedReturn,
  type Trade,
} from "@/lib/domain";
import { getQuoteSeries } from "./quotes-service";
import { fetchReferenceRateSeries } from "./fx-rate";

export interface AssetTwr {
  /** Rentabilidade do período todo, em percentagem. */
  totalPct: number | null;
  /** A mesma, por ano. Null quando o período é curto de mais para anualizar. */
  annualPct: number | null;
  /** Desde quando é medida. */
  since: string | null;
  /** Porque é que não há número, quando não há. */
  problem: string | null;
}

const SEM_RESPOSTA = (problem: string): AssetTwr => ({
  totalPct: null,
  annualPct: null,
  since: null,
  problem,
});

/**
 * A taxa de câmbio de uma data, ou a última fixação anterior.
 *
 * O BCE não publica aos fins de semana nem em feriados. Recuar até à última
 * fixação é o que qualquer corretora faz — o que não se pode é inventar.
 */
function rateOn(rates: Record<string, number>, date: string): number | null {
  if (rates[date] !== undefined) return rates[date]!;
  const anteriores = Object.keys(rates)
    .filter((d) => d <= date)
    .sort();
  const ultima = anteriores.at(-1);
  return ultima === undefined ? null : rates[ultima]!;
}

export async function getAssetTwr(params: {
  symbol: string | null | undefined;
  trades: Trade[];
  currentValueCents: number;
  today: string;
}): Promise<AssetTwr> {
  const { symbol, trades, currentValueCents, today } = params;

  if (trades.length === 0) return SEM_RESPOSTA("Sem movimentos datados.");
  if (!symbol) {
    return SEM_RESPOSTA(
      "Sem símbolo de cotação. A TWR precisa de saber quanto valia a posição em cada reforço.",
    );
  }

  const primeiro = trades.reduce((a, t) => (t.date < a ? t.date : a), trades[0]!.date);

  const series = await getQuoteSeries(symbol, { since: primeiro }).catch(() => null);
  if (!series || series.quotes.length === 0) {
    return SEM_RESPOSTA(series?.problem ?? "Sem cotações históricas para este ativo.");
  }

  const inicioSerie = series.quotes.reduce((a, q) => (q.date < a ? q.date : a), series.quotes[0]!.date);
  if (inicioSerie > primeiro) {
    // O mesmo critério da comparação com o índice: sem preço para o período
    // todo, o número que sairia estava errado e ninguém desconfiaria dele.
    return SEM_RESPOSTA(
      `As cotações só começam em ${inicioSerie} e o primeiro movimento é de ${primeiro}.`,
    );
  }

  /**
   * Os preços, em cêntimos de EURO.
   *
   * A série vem na moeda da bolsa. Misturá-la com movimentos em euros — que é
   * como estão gravados — daria uma rentabilidade inventada, e é precisamente
   * contra isso que existe o invariante "sem taxa de câmbio não se grava preço
   * nenhum". Por isso: ou se converte tudo, ou não há número.
   */
  let precos: Record<string, number> = {};
  if (series.currency && series.currency !== "EUR") {
    const taxas = await fetchReferenceRateSeries(series.currency, primeiro, today).catch(() => null);
    if (!taxas) {
      return SEM_RESPOSTA(
        `Cotações em ${series.currency} e sem taxas de câmbio do período para as converter.`,
      );
    }
    for (const q of series.quotes) {
      const taxa = rateOn(taxas, q.date);
      if (taxa === null || taxa <= 0) continue; // dia sem fixação: fica de fora
      precos[q.date] = Math.round(q.closeCents / taxa);
    }
  } else {
    for (const q of series.quotes) precos[q.date] = q.closeCents;
  }

  /**
   * Antes de calcular: os movimentos batem certo com as cotações?
   *
   * Uma corretora regista um desdobramento como venda + compra no mesmo dia,
   * pelo mesmo dinheiro. A app leu isso como negócios a sério, e o troço desse
   * dia passou a valer ×20 exactos — o ecrã mostrou +4969,9% num investimento
   * que fez +114%. É o modo de falha n.5: um número errado com ar de resposta.
   *
   * Recusar é a única saída honesta enquanto não houver suporte a splits.
   */
  const incoerencia = incoerenciaEntreMovimentosECotacoes(trades, precos);
  if (incoerencia) return SEM_RESPOSTA(incoerencia);

  const pontos = positionValuePoints(trades, precos, today, currentValueCents);
  if (!pontos) {
    return SEM_RESPOSTA("Faltam cotações em dias com movimento.");
  }

  const totalPct = timeWeightedReturn(pontos);
  if (totalPct === null) return SEM_RESPOSTA("Período curto de mais para medir.");

  return {
    totalPct,
    annualPct: annualize(totalPct, primeiro, today),
    since: primeiro,
    problem: null,
  };
}
