/**
 * As leituras de RENDER, memoizadas por pedido.
 *
 * Um render do /patrimonio lia os bens TRÊS vezes (a atualização de preços, a
 * página, e a comparação com os índices atrás do Suspense) e os movimentos e
 * desdobramentos duas — a mesma resposta, pagas de novo, no mesmo pedido. O
 * `memoPorPedido` (o `cache()` do React) dá a mesma leitura a todos e morre
 * com o pedido, por isso o pedido seguinte lê sempre fresco.
 *
 * **REGRA: isto é SÓ para render de páginas e componentes de servidor.** Uma
 * action que escreve e depois relê no mesmo pedido tem de usar
 * `getRepository()` diretamente — por aqui leria o que havia ANTES da escrita.
 * Há um teste a guardar isto (`leituras-so-no-render.test.ts`).
 */

import { memoPorPedido } from "@/lib/memo-por-pedido";
import { getRepository } from "@/lib/data";

export const lerAtivos = memoPorPedido((spaceId: string) =>
  getRepository().listAssets(spaceId),
);

export const lerMovimentos = memoPorPedido((spaceId: string) =>
  getRepository().listAssetTrades(spaceId),
);

export const lerSplits = memoPorPedido((spaceId: string) =>
  getRepository().listAssetSplits(spaceId),
);

export const lerAcertos = memoPorPedido((spaceId: string) =>
  getRepository().listSettlements(spaceId),
);

/**
 * As despesas partilhadas de um ambiente — a leitura que o saldo e as páginas
 * pedem em duplicado. A chave é (ambiente, leitor): filtros mais finos ficam
 * de fora de propósito, para a cache não esconder respostas diferentes.
 */
export const lerDespesasPartilhadas = memoPorPedido((spaceId: string, viewerId: string) =>
  getRepository().listExpenses({ spaceId, viewerId, kind: "shared" }),
);
