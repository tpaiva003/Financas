/**
 * Um ambiente congelado é só de leitura — e isso tem de significar alguma coisa.
 *
 * A lógica que decide congelar vive em `domain/retencao.ts` e está testada há
 * muito. O que faltava era o outro lado: durante várias sessões, `frozen_at`
 * existia na base de dados, o veredito sabia calculá-lo, e **não havia uma única
 * linha de código que impedisse uma escrita**. Um ambiente "congelado" aceitava
 * despesas como qualquer outro. O estado era decorativo.
 *
 * **O problema de espalhar a verificação.** A app tem 86 server actions. Copiar
 * um `if` para cada uma resolve hoje e falha na primeira que se escrever a
 * seguir — que é exactamente o que aconteceu ao isolamento por ambiente, em que
 * seis métodos de despesas ficaram sem o filtro do `space_id` por se ter
 * confiado na disciplina de quem escreve.
 *
 * Por isso a verificação está aqui, numa função só, e há um teste que lê o
 * código-fonte das actions e obriga cada uma a passar por ela ou a estar numa
 * lista de leitura explícita. Esquecer deixa de ser possível em silêncio:
 * passa a partir o `npm run test`.
 *
 * **O que não faz.** Não impede leituras, não apaga nada, e não trava ambientes
 * completos — um ambiente `full` nunca chega a congelar. Ver a regra 1 do
 * `domain/retencao.ts`.
 */

import type { Space } from "@/lib/data";

/**
 * O que se diz a quem tenta escrever num ambiente congelado.
 *
 * Diz o que aconteceu, porquê, e o que fazer a seguir. "Sem permissão" seria
 * verdade e não servia de nada: quem lê não faz ideia do que correu mal nem de
 * que é reversível com um clique.
 */
export const ESCRITA_CONGELADA =
  "Este ambiente está congelado por inatividade e só se pode consultar. " +
  "Nada foi apagado: carrega em «Reativar» para voltar a escrever.";

/** Este ambiente está congelado? */
export function congelado(space: Pick<Space, "frozenAt" | "plan">): boolean {
  // O plano vem primeiro, pela mesma razão que vem primeiro no veredito: um
  // ambiente completo não fica bloqueado nem que tenha um `frozen_at` velho
  // esquecido de quando era gratuito.
  if ((space.plan ?? "free") === "full") return false;
  return Boolean(space.frozenAt);
}

/**
 * Com que frequência é que abrir um ambiente escreve a data de atividade.
 *
 * Uma escrita por cada página aberta seria uma ida à base de dados em todos os
 * pedidos, para gravar quase sempre o mesmo dia. A retenção só precisa do dia,
 * por isso basta gravar quando o dia muda.
 */
export function precisaDeMarcarAtividade(
  lastActivityAt: string | null | undefined,
  agoraISO: string,
): boolean {
  if (!lastActivityAt) return true;
  return lastActivityAt.slice(0, 10) < agoraISO.slice(0, 10);
}
