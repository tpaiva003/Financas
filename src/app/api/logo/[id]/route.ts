/**
 * O logo de um investimento, servido pela própria app.
 *
 * **Porque é que não é o browser a ir buscá-lo.** Todos os serviços de logos
 * funcionam pedindo a imagem pela marca. Se fosse o browser a pedir, o serviço
 * ficava com a lista exacta das ações de quem usa a app — de graça, sem
 * consentimento, e por causa de uma coisa decorativa. Foi essa a razão de não
 * haver logos nenhuns até agora (ver `domain/monogram.ts`). Com esta rota, quem
 * fala com o terceiro é o servidor, e o terceiro vê um servidor.
 *
 * **O domínio nunca vem do pedido.** Vem do bem, lido pelo `space_id` de quem
 * está a ver. Se viesse no URL, esta rota era um buscador de endereços à ordem
 * de quem lhe chamasse — e, num servidor, isso alcança a rede interna.
 *
 * **Um logo que não existe responde 404 e a carteira mostra o monograma.** Sem
 * esse recuo a carteira ficava aos buracos: metade dos ETF e tudo o que não é
 * marca conhecida não tem logo utilizável.
 *
 * A busca em si — três fontes, pela ordem — está em `logo-service`, partilhada
 * com o funil de avaliação. Duas cópias divergiam, e a que ficasse para trás
 * continuava a usar uma fonte em baixo sem ninguém perceber porquê.
 */

import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { dominioValido } from "@/lib/domain";
import { buscarLogo, semLogo } from "@/lib/services/logo-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return semLogo();

  const bem = (await getRepository().listAssets(ctx.space.id).catch(() => [])).find(
    (a) => a.id === params.id,
  );
  // Sem domínio não há logo, e o ecrã já sabe desenhar o monograma.
  const dominio = bem?.logoDomain ? dominioValido(bem.logoDomain) : null;
  if (!dominio) return semLogo();

  return (await buscarLogo(dominio)) ?? semLogo();
}
