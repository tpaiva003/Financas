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
import { normalizeSnapshots, type NetWorth, type NetWorthSnapshot } from "@/lib/domain";

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
