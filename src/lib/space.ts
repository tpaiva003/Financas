/**
 * Contexto de ambiente (space) para Server Components / Actions.
 *
 * Resolve: o utilizador autenticado, os ambientes a que pertence, o ambiente
 * atual (cookie `fin_space`, default = primeiro) e o id do participante (member)
 * que corresponde ao utilizador nesse ambiente.
 */

import { cookies } from "next/headers";
import { requireUser } from "./session";
import { getRepository } from "./data";
import type { Space, Member } from "./data";
import type { HouseholdUser } from "./users";

export const SPACE_COOKIE = "fin_space";

export interface SpaceContext {
  user: HouseholdUser;
  spaces: Space[];
  space: Space;
  members: Member[];
  /** Participante do ambiente atual ligado ao utilizador (p/ privacidade). */
  viewerMemberId: string;
}

export async function getSpaceContext(): Promise<SpaceContext> {
  const user = await requireUser();
  const repo = getRepository();

  let spaces = await repo.listSpacesForUser(user.id);
  if (spaces.length === 0) {
    const casa = await repo.getSpace("casa");
    if (casa) spaces = [casa];
  }

  const wanted = cookies().get(SPACE_COOKIE)?.value;
  const space = spaces.find((s) => s.id === wanted) ?? spaces[0]!;

  const members = space ? await repo.listMembers(space.id) : [];
  const viewerMemberId =
    members.find((m) => m.linkedUserId === user.id)?.id ?? members[0]?.id ?? user.id;

  return { user, spaces, space, members, viewerMemberId };
}
