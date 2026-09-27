/**
 * Serviço de saldo por ambiente: junta dados do repositório à lógica de domínio.
 * Funciona para N participantes (não só 2).
 */

import { computeBalance, simplifyDebts } from "@/lib/domain";
import type { BalanceResult, Transfer } from "@/lib/domain";
import { lerAcertos, lerDespesasPartilhadas } from "@/lib/data/leituras";
import type { Member } from "@/lib/data";

export interface SpaceBalance {
  balance: BalanceResult;
  /** Pagamentos sugeridos para zerar o saldo (mínimos). */
  transfers: Transfer[];
  /** É um ambiente de 2 pessoas? (UI mais simples) */
  isPair: boolean;
}

export async function getSpaceBalance(
  spaceId: string,
  members: Member[],
  viewerMemberId: string,
): Promise<SpaceBalance> {
  const memberIds = members.map((m) => m.id);

  // Leituras memoizadas por pedido: a página dos acertos lê estas duas E chama
  // isto — eram as mesmas tabelas duas vezes no mesmo render. As actions que
  // usam o saldo leem ANTES de escrever, por isso o memo não lhes esconde nada.
  const [expenses, settlements] = await Promise.all([
    lerDespesasPartilhadas(spaceId, viewerMemberId),
    lerAcertos(spaceId),
  ]);

  // Desde quando cada pessoa divide. Sem isto, acrescentar alguém ao ambiente
  // redividia o histórico todo e mexia no saldo de quem já cá estava.
  const participatesFrom: Record<string, string | null> = {};
  for (const m of members) participatesFrom[m.id] = m.participatesFrom ?? null;

  const balance = computeBalance({
    users: memberIds,
    expenses,
    settlements,
    participatesFrom,
  });
  const transfers = simplifyDebts(balance.netByUser);

  return { balance, transfers, isPair: members.length === 2 };
}
