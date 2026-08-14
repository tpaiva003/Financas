/**
 * O logo de uma empresa do funil de avaliação.
 *
 * Gémeo de `api/logo/[id]`, que serve os investimentos, e com as mesmas regras:
 * **o domínio nunca vem do pedido** — vem da linha do funil, lida pelo
 * `space_id` de quem está a ver. Se viesse no URL, esta rota era um buscador de
 * endereços à ordem de quem lhe chamasse, e num servidor isso alcança a rede
 * interna.
 *
 * São duas rotas e não uma com um parâmetro a dizer de que tabela ler: um
 * parâmetro desses é a mesma coisa que aceitar o alvo do cliente, com um passo
 * a mais. A busca em si é partilhada (`logo-service`).
 */

import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { dominioValido } from "@/lib/domain";
import { buscarLogo, semLogo } from "@/lib/services/logo-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return semLogo();

  const avaliacao = (await getRepository().listValuations(ctx.space.id).catch(() => [])).find(
    (v) => v.id === params.id,
  );
  // Sem domínio não há logo, e o ecrã já sabe desenhar as iniciais.
  const dominio = avaliacao?.logoDomain ? dominioValido(avaliacao.logoDomain) : null;
  if (!dominio) return semLogo();

  return (await buscarLogo(dominio)) ?? semLogo();
}
