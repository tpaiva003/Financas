/**
 * Serviço de saldo por ambiente: junta dados do repositório à lógica de domínio.
 * Funciona para N participantes (não só 2).
 */

import { computeBalance, simplifyDebts } from "@/lib/domain";
import type { BalanceResult, Transfer } from "@/lib/domain";
import { getRepository } from "@/lib/data";
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
  const repo = getRepository();
  const memberIds = members.map((m) => m.id);

  const [expenses, settlements] = await Promise.all([
    repo.listExpenses({ spaceId, viewerId: viewerMemberId, kind: "shared" }),
    repo.listSettlements(spaceId),
  ]);

  const balance = computeBalance({ users: memberIds, expenses, settlements });
  const transfers = simplifyDebts(balance.netByUser);

  return { balance, transfers, isPair: members.length === 2 };
}
