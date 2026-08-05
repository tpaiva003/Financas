/**
 * Regras de isolamento entre inquilinos (multi-tenant).
 *
 * A unidade de isolamento é o **ambiente** (space). Uma pessoa vê um ambiente
 * se, e só se, existir um participante desse ambiente ligado à conta dela.
 * Daqui sai tudo o resto — despesas, saldos, categorias, lembretes.
 *
 * A regra menos óbvia, e a que mais depressa se viola sem querer, é a
 * VISIBILIDADE DE CONTAS: quem está na app não pode sequer descobrir que
 * existem outras contas. Uma lista global de utilizadores (para "associar
 * conta", por exemplo) expõe nomes e emails de gente de outro inquilino. Por
 * isso só se veem contas com que se partilha pelo menos um ambiente.
 *
 * Funções puras, para serem testáveis sem base de dados.
 */

export interface Membership {
  spaceId: string;
  /** Conta ligada a este participante; null = participante sem login. */
  linkedUserId: string | null;
}

/** Ambientes onde esta conta é participante. */
export function spacesOf(userId: string, memberships: Membership[]): string[] {
  return [
    ...new Set(
      memberships.filter((m) => m.linkedUserId === userId).map((m) => m.spaceId),
    ),
  ];
}

/**
 * Contas que este utilizador pode ver: as que partilham pelo menos um ambiente
 * com ele. Inclui-se sempre a si próprio, mesmo sem ambientes.
 */
export function accountsVisibleTo(userId: string, memberships: Membership[]): string[] {
  const mine = new Set(spacesOf(userId, memberships));
  const visible = new Set<string>([userId]);
  for (const m of memberships) {
    if (m.linkedUserId && mine.has(m.spaceId)) visible.add(m.linkedUserId);
  }
  return [...visible];
}

/** Este utilizador pode entrar neste ambiente? */
export function canAccessSpace(
  userId: string,
  spaceId: string,
  memberships: Membership[],
): boolean {
  return memberships.some((m) => m.spaceId === spaceId && m.linkedUserId === userId);
}

/**
 * O dono da plataforma é participante deste ambiente?
 *
 * Serve para garantir o contrário: ao criar o ambiente de um cliente, o dono
 * NÃO entra como participante. Ele administra a plataforma, não participa nas
 * contas de quem a usa — e não deve aparecer em lado nenhum dentro dela.
 */
export function ownerIsMemberOf(
  ownerId: string,
  spaceId: string,
  memberships: Membership[],
): boolean {
  return canAccessSpace(ownerId, spaceId, memberships);
}
