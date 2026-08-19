/**
 * Contexto de ambiente (space) para Server Components / Actions.
 *
 * Resolve: o utilizador autenticado, os ambientes a que pertence, o ambiente
 * atual (cookie `fin_space`, default = primeiro) e o id do participante (member)
 * que corresponde ao utilizador nesse ambiente.
 */

import { memoPorPedido } from "@/lib/memo-por-pedido";
import { cookies } from "next/headers";
import { requireUser } from "./session";
import { getRepository } from "./data";
import type { Space, Member, MemberRole } from "./data";
import { planForNewSpace } from "@/lib/domain";
import { congelado, precisaDeMarcarAtividade } from "./congelamento";
import { isEmailAllowed } from "./env";
import type { HouseholdUser } from "./users";

export const SPACE_COOKIE = "fin_space";

export interface SpaceContext {
  user: HouseholdUser;
  spaces: Space[];
  space: Space;
  /** Todos os participantes (inclui submitters). */
  members: Member[];
  /** Participantes plenos, os que participam no saldo (pagam/dividem). */
  fullMembers: Member[];
  /** Participante do ambiente atual ligado ao utilizador (p/ privacidade). */
  viewerMemberId: string;
  /** Papel do utilizador no ambiente atual. */
  viewerRole: MemberRole;
  /**
   * O ambiente atual está congelado por inatividade: só de leitura.
   *
   * Vem no contexto e não numa consulta à parte para que nenhuma action tenha
   * de se lembrar de a ir buscar. Ver `lib/congelamento.ts`.
   */
  congelado: boolean;
}

/** Ambiente de destino resolvido para uma operação (ex.: importar). */
export interface TargetSpace {
  space: Space;
  members: Member[];
  fullMembers: Member[];
  viewerMemberId: string;
  viewerRole: MemberRole;
  /** Congelado por inatividade: só de leitura. */
  congelado: boolean;
}

/**
 * Resolve um ambiente de destino diferente do ativo, garantindo que o
 * utilizador pertence mesmo a ele. Devolve null se não pertencer.
 */
export async function getTargetSpace(
  ctx: SpaceContext,
  spaceId: string,
): Promise<TargetSpace | null> {
  if (spaceId === ctx.space.id) {
    return {
      space: ctx.space,
      members: ctx.members,
      fullMembers: ctx.fullMembers,
      viewerMemberId: ctx.viewerMemberId,
      viewerRole: ctx.viewerRole,
      congelado: ctx.congelado,
    };
  }

  const space = ctx.spaces.find((s) => s.id === spaceId);
  if (!space) return null; // não pertence a este ambiente

  const members = await getRepository().listMembers(space.id);
  const fullMembers = members.filter((m) => (m.role ?? "full") !== "submitter");
  const viewerMember = members.find((m) => m.linkedUserId === ctx.user.id);

  return {
    space,
    members,
    fullMembers,
    viewerMemberId: viewerMember?.id ?? members[0]?.id ?? ctx.user.id,
    viewerRole: viewerMember?.role ?? "full",
    // O ambiente de destino tem o seu próprio estado: importar para um ambiente
    // congelado é uma escrita nesse ambiente, não no que está aberto no ecrã.
    congelado: congelado(space),
  };
}

/**
 * Memoizado por pedido com o `cache()` do React, de propósito.
 *
 * Isto corre no layout E outra vez em cada página — 4 a 5 consultas de cada
 * vez, em todas as navegações da app inteira. Dentro do mesmo pedido a
 * resposta é a mesma, e pagar duas vezes era só latência. O `cache()` morre
 * com o pedido: uma action que escreva e um pedido novo leem sempre fresco.
 */
export const getSpaceContext = memoPorPedido(async function getSpaceContext(): Promise<SpaceContext> {
  const user = await requireUser();
  const repo = getRepository();

  let spaces = await repo.listSpacesForUser(user.id);
  if (spaces.length === 0) {
    // NUNCA cair no ambiente de outra pessoa: quem entra sem ambientes recebe o
    // seu próprio. Antes havia um fallback para "casa", o que fazia um
    // utilizador novo aterrar nas contas de outra pessoa.
    const own = await repo.createSpace({
      name: "Pessoal",
      createdBy: user.id,
      // Quem está na lista das variáveis de ambiente são os donos da casa e não
      // leva tectos. Quem se registou sozinho começa no gratuito — é o que
      // impede o registo aberto de virar alojamento gratuito de dados de
      // desconhecidos, com o custo e as obrigações que isso traz.
      plan: planForNewSpace(isEmailAllowed(user.email)),
      members: [{ name: user.name, linkedUserId: user.id, email: user.email }],
    });
    spaces = [own];
  }

  const wanted = cookies().get(SPACE_COOKIE)?.value;
  const space = spaces.find((s) => s.id === wanted) ?? spaces[0]!;

  const members = space ? await repo.listMembers(space.id) : [];
  const fullMembers = members.filter((m) => (m.role ?? "full") !== "submitter");
  const viewerMember = members.find((m) => m.linkedUserId === user.id);
  // Sem fallback para o primeiro participante: isso faria passar por outra
  // pessoa. Os ambientes vêm sempre de uma ligação ao utilizador.
  const viewerMemberId = viewerMember?.id ?? user.id;
  const viewerRole: MemberRole = viewerMember?.role ?? "full";

  // Entrar conta como atividade (regra 3 do `domain/retencao.ts`): quem abre a
  // app todas as semanas para ver o saldo, e nunca lança nada, está a usar isto.
  // Contar só despesas dava a esse ambiente o perfil de um abandonado.
  //
  // Grava no máximo uma vez por dia, e o erro é engolido de propósito: falhar a
  // marcar a atividade não pode deitar abaixo a página. O pior que acontece é a
  // marca ficar para a visita seguinte.
  const agora = new Date().toISOString();
  if (space && precisaDeMarcarAtividade(space.lastActivityAt, agora)) {
    await repo.touchSpaceActivity(space.id, agora).catch(() => {});
    space.lastActivityAt = agora;
  }

  return {
    user,
    spaces,
    space,
    members,
    fullMembers,
    viewerMemberId,
    viewerRole,
    congelado: congelado(space),
  };
});
