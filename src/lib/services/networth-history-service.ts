/**
 * Guardar e ler as fotografias do património.
 *
 * **Porquê guardar.** O património da app é uma fotografia: cada bem tem o
 * valor de hoje e mais nada. O passado não se reconstrói — o depósito que hoje
 * tem 12 mil não sabe que teve 8 mil no ano passado. As despesas dão-se a
 * reconstruir porque são movimentos datados; um saldo não. Logo: ou se grava, ou
 * não há gráfico nenhum para desenhar.
 *
 * **Grava-se quando a página é vista, e não por um cron.** A alternativa era uma
 * tarefa diária a passar por todos os ambientes, com mais um segredo, mais uma
 * entrada no `vercel.json` e uma lista de ambientes a percorrer. Isto grava uma
 * vez por dia por ambiente, na visita, e é idempotente. O preço é haver buracos
 * nos períodos em que ninguém abriu a app — e o gráfico **não os preenche**: um
 * traço entre dois pontos distantes seria uma afirmação sobre meses de que não
 * se sabe nada.
 *
 * **Uma falha a gravar não deita a página abaixo — mas também não fica calada.**
 * A primeira versão engolia o erro por inteiro, e o resultado era o pior dos
 * dois mundos: o gráfico dizia "o histórico está a começar" para sempre,
 * enquanto a escrita falhava todos os dias. Agora a página desenha-se na mesma
 * e o cartão diz o que aconteceu.
 */

import { getRepository } from "@/lib/data";
import {
  BENCHMARKS,
  buildCreditoPlano,
  juntarHistorico,
  priceOn,
  normalizeSnapshots,
  normalizeSymbol,
  ownershipShare,
  parseCreditTerms,
  mesAnterior,
  reconstruirHistorico,
  type AtivoReconstruivel,
  type ImovelReconstruivel,
  type DividaReconstruivel,
  type NetWorth,
  type NetWorthSnapshot,
} from "@/lib/domain";
import { getQuoteSeries } from "./quotes-service";
import { indicesDeImoveis } from "./imovel-service";

/** O que aconteceu à fotografia de hoje. */
export type CapturaEstado = "gravada" | "sem-bens" | "falhou";

/**
 * Grava a fotografia de hoje, se houver alguma coisa para fotografar.
 *
 * Um ambiente sem bens nenhuns não entra: uma linha de zeros no gráfico não é
 * história, é ruído — e o primeiro ponto a sério apareceria como um salto
 * vindo do nada.
 *
 * Devolve o que aconteceu em vez de `void`. Sem isto, uma escrita a falhar
 * todos os dias era indistinguível de um histórico que ainda agora começou.
 */
export async function captureNetWorthSnapshot(
  spaceId: string,
  net: NetWorth,
  onDate: string,
): Promise<CapturaEstado> {
  if (net.assets.length === 0) return "sem-bens";

  const breakdown: Record<string, number> = {};
  for (const k of net.byKind) breakdown[k.kind] = k.totalCents;

  try {
    await getRepository().saveNetWorthSnapshot({
      spaceId,
      onDate,
      assetsCents: net.totalAssetsCents,
      debtsCents: net.totalLiabilitiesCents,
      netCents: net.netCents,
      breakdown,
    });
    return "gravada";
  } catch {
    // Ver o cabeçalho: ninguém fica sem ver o património por causa disto —
    // mas quem chama diz-lhe que falhou.
    return "falhou";
  }
}

/**
 * O histórico do ambiente, já limpo e por ordem.
 *
 * Devolve vazio quando não há nada — ou quando a tabela ainda não existe, que é
 * o estado normal antes de a migração ser corrida. A página desenha-se na
 * mesma e diz que o histórico ainda está a começar.
 */
export async function getNetWorthHistory(spaceId: string): Promise<NetWorthSnapshot[]> {
  const rows = await getRepository()
    .listNetWorthSnapshots(spaceId)
    .catch(() => []);
  return normalizeSnapshots(rows);
}

/**
 * Reconstruir o passado a partir dos movimentos.
 *
 * **O que é medido e o que é assumido.** Um investimento tem movimentos datados
 * e cotações guardadas: quantas unidades havia em Março e a que preço fechavam
 * sabe-se. Um crédito com taxa e prestação recua pela própria amortização. E um
 * imóvel com escritura datada e índice do concelho recua pelo índice — o que
 * custou é um facto com data, e a série do INE é pública.
 *
 * O que **não** tem passado nenhum é uma conta bancária: o depósito que hoje
 * tem 12 mil não sabe que teve 8 mil no ano passado. Essa entra ao valor de
 * hoje, o que quer dizer que a linha mostra o saldo de hoje no ano passado.
 *
 * Foi pedido assim, sabendo-o. O que não se faz é deixar de o dizer: todos
 * estes pontos saem marcados como `estimado` e o gráfico desenha-os a
 * tracejado, com legenda.
 *
 * **O câmbio fica congelado no de hoje.** A cotação guardada está na moeda da
 * bolsa; o preço em euros só se sabe para hoje. Usa-se a razão entre o fecho da
 * data e o fecho mais recente, aplicada ao preço em euros de hoje — a moeda
 * desaparece da conta e evita-se ir buscar uma taxa a cada mês. O preço fica
 * certo; o câmbio não se mexe. É mais uma razão para isto ser uma estimativa.
 */
async function reconstruirDoPassado(spaceId: string, hoje: string): Promise<NetWorthSnapshot[]> {
  const repo = getRepository();
  const [stored, trades] = await Promise.all([
    repo.listAssets(spaceId).catch(() => []),
    repo.listAssetTrades(spaceId).catch(() => []),
  ]);
  if (stored.length === 0) return [];

  const movimentosDe = new Map<string, { date: string; unidades: number }[]>();
  for (const t of trades) {
    // Só compras e vendas mexem nas unidades. Dividendos e custos são dinheiro,
    // não posição.
    if (t.kind !== "compra" && t.kind !== "venda") continue;
    const q = typeof t.quantity === "number" ? Math.abs(t.quantity) : 0;
    if (q <= 0) continue;
    const unidades = t.kind === "venda" ? -q : q;
    movimentosDe.set(t.assetId, [...(movimentosDe.get(t.assetId) ?? []), { date: t.date, unidades }]);
  }

  const investimentos: AtivoReconstruivel[] = [];
  const imoveis: ImovelReconstruivel[] = [];

  /**
   * As datas que a reconstrução vai visitar, para se ir buscar o índice de
   * cada uma numa leitura só.
   *
   * Tem de ser calculado com a mesma regra do `reconstruirHistorico` — o mês
   * anterior, repetido — senão as chaves não casam e o índice nunca é
   * encontrado, o que degradaria em silêncio para o valor de hoje.
   */
  const datas: string[] = [];
  {
    let d = mesAnterior(hoje);
    for (let k = 1; k <= MESES_A_RECONSTRUIR; k++) {
      datas.push(d);
      d = mesAnterior(d);
    }
  }
  const indices = await indicesDeImoveis(stored, datas).catch(() => new Map());

  let outrosAtivosCents = 0;
  let outrasDividasCents = 0;
  const dividas: DividaReconstruivel[] = [];

  for (const a of stored) {
    const quota = ownershipShare(a);

    if (a.kind === "investimento") {
      const movimentos = movimentosDe.get(a.id) ?? [];
      const simbolo = normalizeSymbol(String(a.symbol ?? ""));
      let precos: { date: string; closeEurCents: number }[] = [];

      if (simbolo && typeof a.unitPriceCents === "number" && a.unitPriceCents > 0) {
        const guardadas = await repo.listQuotes(simbolo).catch(() => []);
        const ultima = guardadas.at(-1);
        if (ultima && ultima.closeCents > 0) {
          // A razão contra o fecho mais recente, aplicada ao preço em euros de
          // hoje. Ver o cabeçalho: é isto que faz a moeda desaparecer.
          const emEurosPorFecho = a.unitPriceCents / ultima.closeCents;
          precos = guardadas.map((q) => ({
            date: q.date,
            closeEurCents: Math.round(q.closeCents * emEurosPorFecho * quota),
          }));
        }
      }

      investimentos.push({
        movimentos,
        precos,
        custoUnitarioCents:
          typeof a.unitCostCents === "number" ? Math.round(a.unitCostCents * quota) : null,
      });
      continue;
    }

    const valor = Math.round((a.valueCents ?? 0) * quota);
    if (a.kind !== "divida") {
      // Os imóveis com índice são tratados à parte, logo a seguir: recuam pelo
      // índice da zona em vez de irem ao valor de hoje.
      if (a.kind === "imovel" && indices.has(a.id)) {
        const idx = indices.get(a.id)!;
        imoveis.push({
          custoCents: Math.round(idx.custoCents * quota),
          indiceCompraCents: idx.indiceCompraCents,
          indicePorData: idx.indicePorData,
          valorHojeCents: valor,
        });
        continue;
      }
      outrosAtivosCents += valor;
      continue;
    }

    // Um crédito com taxa e prestação recua pela própria amortização. Sem elas
    // não há por onde recuar, e fica ao valor de hoje.
    const terms = parseCreditTerms(a.creditTerms);
    const plano = terms
      ? buildCreditoPlano({
          balanceCents: valor,
          startDate: hoje,
          maturityDate: a.maturityDate,
          periods: terms.periods,
          indexanteRates: terms.indexanteRates,
        })
      : null;
    const taxa = plano?.tramos[0]?.annualRatePct ?? a.interestRatePct ?? null;
    const prestacao = plano?.currentPaymentCents ?? a.monthlyPaymentCents ?? null;

    if (valor > 0 && typeof taxa === "number" && taxa >= 0 && typeof prestacao === "number" && prestacao > 0) {
      dividas.push({ balanceCents: valor, annualRatePct: taxa, monthlyPaymentCents: prestacao });
    } else {
      outrasDividasCents += valor;
    }
  }

  return reconstruirHistorico({
    hoje,
    meses: MESES_A_RECONSTRUIR,
    investimentos,
    dividas,
    imoveis,
    outrosAtivosCents,
    outrasDividasCents,
  });
}

/** Até onde se recua. Mais do que isto é passado a fingir com anos de idade. */
const MESES_A_RECONSTRUIR = 36;

/**
 * O histórico completo: o que foi medido, mais o que se conseguiu reconstruir.
 *
 * **O medido ganha sempre.** Um mês com fotografia a sério não é substituído
 * por uma estimativa — é o único ponto daquele mês em que se pode confiar.
 */
export async function getNetWorthHistoryCompleto(
  spaceId: string,
  hoje: string,
): Promise<NetWorthSnapshot[]> {
  const [medido, estimado] = await Promise.all([
    getNetWorthHistory(spaceId),
    reconstruirDoPassado(spaceId, hoje).catch(() => []),
  ]);
  return juntarHistorico(estimado, medido);
}

/**
 * As linhas dos índices para o gráfico do património.
 *
 * **O que isto é, e sobretudo o que não é.** Um índice não recebe reforços e
 * não tem casa nem crédito lá dentro; o património tem as três coisas. Estas
 * linhas respondem a "o que teria feito o mercado no mesmo período", partindo
 * do mesmo ponto — e mais nada. A comparação a sério, com os mesmos reforços
 * nas mesmas datas, vive na página dos Ativos e é essa que serve para julgar
 * uma carteira.
 *
 * Fica aqui na mesma porque a pergunta "o mercado subiu ou desceu enquanto eu
 * estava a poupar?" é legítima e não tinha resposta em lado nenhum.
 *
 * Normaliza-se ao primeiro ponto **medido**: partir de um reconstruído punha o
 * índice a espelhar a distância entre a estimativa e a realidade.
 */
export interface LinhaDeIndice {
  id: string;
  label: string;
  /** Um valor por cada ponto da série, ou `null` onde não há cotação. */
  valores: (number | null)[];
}

export async function linhasDeIndice(
  pontos: readonly { onDate: string; netCents: number; estimado?: boolean }[],
): Promise<LinhaDeIndice[]> {
  const medidos = pontos.filter((p) => !p.estimado);
  const base = medidos[0];
  if (!base || pontos.length < 2 || base.netCents <= 0) return [];

  /**
   * Os índices vão todos ao mesmo tempo.
   *
   * Eram em fila indiana, e cada um pode ter de ir à fonte: com três índices, o
   * gráfico do resumo esperava pelos três somados antes de desenhar. Não há
   * dependência nenhuma entre eles — o único preço de os juntar era a ordem, e
   * essa restabelece-se no fim pelo índice do `map`.
   *
   * **Nunca podem custar a página**: um `catch` por índice, e quem não responder
   * simplesmente não tem linha. Ver o cabeçalho.
   */
  const linhas = await Promise.all(
    BENCHMARKS.map(async (b): Promise<LinhaDeIndice | null> => {
      let quotes: { date: string; closeCents: number }[] = [];
      for (const candidato of b.symbols) {
        const s = await getQuoteSeries(candidato.symbol, { since: base.onDate }).catch(() => null);
        if (s && s.quotes.length > 0) {
          quotes = s.quotes;
          break;
        }
      }
      if (quotes.length === 0) return null;

      const precos: Record<string, number> = {};
      for (const q of quotes) precos[q.date] = q.closeCents;
      const inicial = priceOn(precos, base.onDate, 20);
      if (inicial === null || inicial <= 0) return null;

      const valores = pontos.map((p) => {
        // Antes do ponto de partida não há linha nenhuma para desenhar.
        if (p.onDate < base.onDate) return null;
        const preco = priceOn(precos, p.onDate, 20);
        if (preco === null || preco <= 0) return null;
        return Math.round(base.netCents * (preco / inicial));
      });
      return { id: b.id, label: b.label, valores };
    }),
  );

  return linhas.filter((l): l is LinhaDeIndice => l !== null);
}
