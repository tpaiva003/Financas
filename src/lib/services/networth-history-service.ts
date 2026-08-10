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
  buildCreditoPlano,
  juntarHistorico,
  normalizeSnapshots,
  normalizeSymbol,
  ownershipShare,
  parseCreditTerms,
  reconstruirHistorico,
  type AtivoReconstruivel,
  type DividaReconstruivel,
  type NetWorth,
  type NetWorthSnapshot,
} from "@/lib/domain";

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
 * sabe-se. Um crédito com taxa e prestação recua pela própria amortização. Uma
 * conta bancária e um imóvel **não têm passado nenhum** — entram ao valor de
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
