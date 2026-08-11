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
 */

import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { dominioValido } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Quanto tempo o browser pode guardar. Um logo não muda de semana para semana. */
const CACHE_SEGUNDOS = 60 * 60 * 24 * 7;
const TIMEOUT_MS = 5_000;
/** Um ícone acima disto não é um ícone. Trava uma resposta absurda da fonte. */
const MAX_BYTES = 512 * 1024;

function naoExiste(): Response {
  // Curto e cacheável: sem isto, cada carregamento da carteira repetia o
  // pedido falhado por cada ativo sem logo.
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return naoExiste();

  const bem = (await getRepository().listAssets(ctx.space.id).catch(() => [])).find(
    (a) => a.id === params.id,
  );
  // Sem domínio não há logo, e o ecrã já sabe desenhar o monograma.
  const dominio = bem?.logoDomain ? dominioValido(bem.logoDomain) : null;
  if (!dominio) return naoExiste();

  try {
    const controlo = new AbortController();
    const t = setTimeout(() => controlo.abort(), TIMEOUT_MS);
    const res = await fetch(`https://icons.duckduckgo.com/ip3/${dominio}.ico`, {
      signal: controlo.signal,
      next: { revalidate: CACHE_SEGUNDOS },
    });
    clearTimeout(t);
    if (!res.ok) return naoExiste();

    const tipo = res.headers.get("content-type") ?? "";
    // Só imagens. Uma página de erro devolvida com 200 é HTML, e um `<img>`
    // que recebe HTML mostra o ícone partido em vez de cair no recuo.
    if (!tipo.startsWith("image/")) return naoExiste();

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return naoExiste();

    return new Response(bytes, {
      headers: {
        "content-type": tipo,
        "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}, immutable`,
        // O endereço desta rota tem o id do bem lá dentro; não vai no Referer.
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return naoExiste();
  }
}
