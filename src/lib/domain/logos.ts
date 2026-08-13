/**
 * De onde vem o ícone de uma marca.
 *
 * **Porque é que são três fontes e não uma.** Todos os logos desta app vinham
 * de um serviço só. Um serviço gratuito que passe a responder 404, a limitar
 * pedidos, ou a recusar o endereço de saída da Vercel apaga **todos os logos ao
 * mesmo tempo** — e o que se vê é uma carteira que tinha logos e deixou de ter,
 * que se lê como perda de dados. Não se perdeu nada: o domínio continua gravado
 * e o recuo é o monograma. Mas a diferença entre "a fonte está em baixo" e
 * "apagaram-me os logos" não estava em lado nenhum, e é a diferença entre
 * esperar e ir procurar um problema que não existe.
 *
 * É o mesmo raciocínio das cotações, que já levaram com isto quando a Stooq
 * passou a responder com uma página anti-robô: uma fonte gratuita muda de
 * comportamento de um dia para o outro, e sem alternativa a funcionalidade
 * morre com ela.
 *
 * **A ordem não é arbitrária.** A última é o próprio site da empresa: é a que
 * conta menos a terceiros — quem recebe o pedido é a dona da marca, e um pedido
 * ao `favicon.ico` da EDP não diz a ninguém quem tem ações da EDP. Vem em
 * último porque é a menos fiável (nem todos servem um `.ico` no sítio certo),
 * não por ser a pior.
 *
 * Em nenhum caso é o browser a pedir: quem fala com a fonte é sempre o
 * servidor. Ver `api/logo/[id]`.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface FonteDeLogo {
  id: string;
  url: (dominio: string) => string;
}

export const FONTES_DE_LOGO: readonly FonteDeLogo[] = [
  { id: "duckduckgo", url: (d) => `https://icons.duckduckgo.com/ip3/${d}.ico` },
  { id: "google", url: (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128` },
  { id: "proprio", url: (d) => `https://${d}/favicon.ico` },
] as const;

/**
 * Os endereços a tentar, por ordem.
 *
 * O domínio **já vem validado** por quem chama (`dominioValido`). Esta função
 * não valida nada de propósito: duas validações em sítios diferentes divergem, e
 * a que fica desactualizada é sempre a que ninguém está a olhar.
 */
export function urlsDoLogo(dominio: string): string[] {
  return FONTES_DE_LOGO.map((f) => f.url(dominio));
}

/**
 * A resposta serve como ícone?
 *
 * **O tamanho mínimo não é zelo.** Vários serviços respondem `200` com um GIF
 * transparente de 1×1 quando não conhecem o domínio — um "não sei" disfarçado
 * de sucesso. Aceitá-lo gastava a primeira fonte e desenhava um quadrado vazio
 * onde o monograma teria dito alguma coisa; e como responde 200, nunca se
 * passaria à fonte seguinte.
 */
export function pareceIcone(
  tipo: string | null,
  bytes: number,
  limite: number,
): boolean {
  if (!tipo || !tipo.startsWith("image/")) return false;
  // Um GIF/PNG de 1×1 anda pelos 43-70 bytes. Um ícone a sério não é tão pequeno.
  if (bytes < 100) return false;
  return bytes <= limite;
}
