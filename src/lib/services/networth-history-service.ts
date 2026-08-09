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
 * **Nada disto pode deitar a página abaixo.** Uma falha a gravar — a tabela
 * ainda não existe, a migração ainda não foi corrida — não pode impedir alguém
 * de ver o seu património. Falha calada, de propósito e só aqui.
 */

import { getRepository } from "@/lib/data";
import { normalizeSnapshots, type NetWorth, type NetWorthSnapshot } from "@/lib/domain";

/**
 * Grava a fotografia de hoje, se houver alguma coisa para fotografar.
 *
 * Um ambiente sem bens nenhuns não entra: uma linha de zeros no gráfico não é
 * história, é ruído — e o primeiro ponto a sério apareceria como um salto
 * vindo do nada.
 */
export async function captureNetWorthSnapshot(
  spaceId: string,
  net: NetWorth,
  onDate: string,
): Promise<void> {
  if (net.assets.length === 0) return;

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
  } catch {
    // Ver o cabeçalho: ninguém fica sem ver o património por causa disto.
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
