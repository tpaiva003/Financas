/**
 * Serviço de saldo: junta dados do repositório à lógica de domínio.
 */

import { computeBalance, pairwiseStatement } from "@/lib/domain";
import type { BalanceResult, PairwiseStatement } from "@/lib/domain";
import { householdUsers } from "@/lib/users";
import { getRepository } from "@/lib/data";

export interface HouseholdBalance {
  balance: BalanceResult;
  statement: PairwiseStatement;
  userAId: string;
  userBId: string;
}

export async function getHouseholdBalance(viewerId: string): Promise<HouseholdBalance> {
  const repo = getRepository();
  const users = householdUsers();
  const userIds = users.map((u) => u.id);

  // Para o saldo só interessam as partilhadas (visíveis a ambos); usamos o
  // viewer só para satisfazer a interface — as partilhadas passam o filtro.
  const [expenses, settlements] = await Promise.all([
    repo.listExpenses({ viewerId, kind: "shared" }),
    repo.listSettlements(),
  ]);

  const balance = computeBalance({ users: userIds, expenses, settlements });
  const statement = pairwiseStatement(
    balance.netByUser,
    userIds[0] ?? "",
    userIds[1] ?? "",
  );

  return {
    balance,
    statement,
    userAId: userIds[0] ?? "",
    userBId: userIds[1] ?? "",
  };
}
