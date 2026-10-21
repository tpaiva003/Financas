/**
 * O emblema de um investimento, quando não há logo.
 *
 * **Porquê não ir buscar logos.** Todos os serviços de logos de empresas são
 * externos e funcionam pedindo a imagem pelo ticker — ou seja, o browser de
 * quem usa a app diria a um terceiro exatamente que ações a pessoa tem. Numa
 * app de finanças pessoais isso é caro por uma coisa decorativa. Além disso
 * falham para metade dos ETF e para tudo o que não seja uma marca conhecida, o
 * que obrigaria a ter um recuo — que acabaria por ser isto.
 *
 * Então: iniciais num quadrado com cor derivada do próprio símbolo. A cor é
 * **determinística**, e é isso que a torna útil: a AAPL é sempre do mesmo tom,
 * por isso a carteira ganha memória visual e reconhece-se de relance sem se ler
 * o texto. Duas ações diferentes podem calhar em tons parecidos; não faz mal
 * nenhum, porque o ticker está sempre escrito ao lado.
 *
 * Lógica pura, sem rede e sem dependências. Se um dia se ligar um serviço de
 * logos, entra por cima disto e isto fica como recuo.
 */

export interface Monogram {
  /** Uma ou duas letras, em maiúsculas. */
  letters: string;
  /** Matiz em graus (0-359), para compor a cor. */
  hue: number;
}

/**
 * As letras a mostrar.
 *
 * Prefere-se o ticker ao nome: é mais curto, é o que a pessoa reconhece, e não
 * traz o ruído de "ISHARES CORE MSCI WORLD UCITS ETF USD ACC". Do ticker tira-se
 * a parte antes do sufixo de praça, porque o `.us` não distingue nada.
 */
function lettersFrom(raw: string): string {
  const limpo = (raw ?? "").trim();
  if (!limpo) return "?";

  // "vwce.de" → "vwce"; "^spx" → "spx".
  const semSufixo = limpo.replace(/^\^/, "").split(".")[0] ?? limpo;

  // Um ticker é uma palavra só: ficam as duas primeiras letras.
  const palavras = semSufixo.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0]!.slice(0, 2).toUpperCase();

  // Um nome com várias palavras: a inicial das duas primeiras que contem.
  const IGNORAR = new Set(["de", "da", "do", "the", "of", "and", "e"]);
  const uteis = palavras.filter((p) => !IGNORAR.has(p.toLowerCase()));
  const escolhidas = (uteis.length >= 2 ? uteis : palavras).slice(0, 2);
  return escolhidas.map((p) => p[0]!).join("").toUpperCase();
}

/**
 * Uma matiz estável a partir do texto.
 *
 * FNV-1a de 32 bits, o mesmo que a app já usa para as impressões digitais dos
 * ficheiros: barato, sem dependências e igual em todo o lado. O que importa
 * aqui não é a qualidade estatística do hash, é ser sempre o mesmo.
 */
function hueFrom(raw: string): number {
  let hash = 0x811c9dc5;
  const s = (raw ?? "").trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

export function monogramFor(symbol: string | null | undefined, name: string): Monogram {
  const base = (symbol ?? "").trim() || name;
  return { letters: lettersFrom(base), hue: hueFrom(base) };
}
