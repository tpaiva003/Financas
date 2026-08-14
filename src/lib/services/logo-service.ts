/**
 * Ir buscar o ícone de uma marca, pela ordem das fontes.
 *
 * **Quem fala com o terceiro é o servidor.** Se fosse o browser a pedir, o
 * serviço ficava com a lista exacta das empresas que alguém anda a estudar — de
 * graça, sem consentimento, e por causa de uma coisa decorativa.
 *
 * Vive num serviço partilhado porque há dois sítios a pedir logos — os
 * investimentos e o funil de avaliação — e duas cópias desta lógica divergiam:
 * a que ficasse para trás continuava a usar uma fonte em baixo e ninguém
 * perceberia porquê.
 */

import { pareceIcone, urlsDoLogo } from "@/lib/domain";

const TIMEOUT_MS = 5_000;
/** Um ícone acima disto não é um ícone. Trava uma resposta absurda da fonte. */
const MAX_BYTES = 512 * 1024;
/** Quanto tempo o browser pode guardar. Um logo não muda de semana para semana. */
export const LOGO_CACHE_SEGUNDOS = 60 * 60 * 24 * 7;

/**
 * Um 404 curto e cacheável.
 *
 * Sem o cache, cada carregamento da página repetia o pedido falhado por cada
 * cartão sem logo.
 */
export function semLogo(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/**
 * A imagem, ou `null` se nenhuma fonte a der.
 *
 * Uma fonte que falhe não trava as outras — era exactamente isso que fazia um
 * serviço em baixo parecer uma carteira que perdeu os logos.
 */
export async function buscarLogo(dominio: string): Promise<Response | null> {
  for (const url of urlsDoLogo(dominio)) {
    const controlo = new AbortController();
    const t = setTimeout(() => controlo.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controlo.signal,
        next: { revalidate: LOGO_CACHE_SEGUNDOS },
      });
      if (!res.ok) continue;

      const tipo = res.headers.get("content-type");
      const bytes = await res.arrayBuffer();
      // Só imagens, e imagens a sério: uma página de erro devolvida com 200 é
      // HTML, e um pixel transparente de 1×1 é um "não sei" disfarçado de
      // sucesso. Ver `pareceIcone`.
      if (!pareceIcone(tipo, bytes.byteLength, MAX_BYTES)) continue;

      return new Response(bytes, {
        headers: {
          "content-type": tipo!,
          "Cache-Control": `public, max-age=${LOGO_CACHE_SEGUNDOS}, immutable`,
          // O endereço desta rota tem um id lá dentro; não vai no Referer.
          "Referrer-Policy": "no-referrer",
        },
      });
    } catch {
      // Rede, tempo esgotado, certificado do próprio site: passa-se à seguinte.
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}
