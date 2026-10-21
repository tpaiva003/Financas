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

import { getCurrentUser } from "@/lib/session";
import { getRepository } from "@/lib/data";
import { dominioValido } from "@/lib/domain";
import { buscarLogo, semLogo } from "@/lib/services/logo-service";

export const dynamic = "force-dynamic";

/**
 * O caminho é LEVE de propósito: um carregamento da carteira dispara um
 * pedido destes por cada cartão com logo. Isto chamava o contexto inteiro
 * (4-5 consultas) e lia TODOS os bens do ambiente — por logo. Agora é a
 * sessão mais UMA consulta, e a verificação de pertença (incluindo o papel
 * de submitter) vive no repositório, junto do dado que protege.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return semLogo();

  const guardado = await getRepository()
    .getAssetLogoDomain(params.id, user.id)
    .catch(() => null);
  // Sem domínio não há logo, e o ecrã já sabe desenhar o monograma.
  const dominio = guardado ? dominioValido(guardado) : null;
  if (!dominio) return semLogo();

  return (await buscarLogo(dominio)) ?? semLogo();
}
