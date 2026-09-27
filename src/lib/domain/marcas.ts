/**
 * De que marca é este investimento.
 *
 * **Metade da carteira resolve-se sem perguntar a ninguém.** Os ETF trazem a
 * gestora no nome — "ISHARES CORE MSCI WORLD UCITS ETF", "VANGUARD FTSE
 * ALL-WORLD" — e há uma dúzia de gestoras a cobrir quase tudo o que se compra
 * na Europa. Uma tabela resolve esses casos de graça, sem chamada nenhuma, sem
 * espera e sem poder errar.
 *
 * O que sobra são ações de empresas, onde o nome não diz o domínio ("KNOT
 * OFFSHORE PARTNERS"). Essas ficam para o modelo, e a resposta dele é
 * verificada contra a fonte de logos antes de valer.
 *
 * **A ordem importa.** A gestora vai primeiro porque um ETF da iShares sobre a
 * Apple é da iShares, não da Apple — e o modelo, ao ver "MSCI WORLD", tem toda
 * a probabilidade de dar um domínio qualquer de índices.
 *
 * Lógica pura, sem rede.
 */

/**
 * Gestoras de fundos e ETF, pela palavra que aparece no nome do produto.
 *
 * Escrito em minúsculas e sem acentos: a comparação é feita sobre o nome
 * normalizado, porque os ficheiros de corretora vêm em maiúsculas e truncados.
 */
const GESTORAS: [palavra: string, dominio: string][] = [
  ["ishares", "ishares.com"],
  ["blackrock", "blackrock.com"],
  ["vanguard", "vanguard.com"],
  ["xtrackers", "xtrackers.com"],
  ["amundi", "amundi.com"],
  ["lyxor", "lyxor.com"],
  ["spdr", "ssga.com"],
  ["state street", "ssga.com"],
  ["invesco", "invesco.com"],
  ["fidelity", "fidelity.com"],
  ["jpmorgan", "jpmorgan.com"],
  ["j.p. morgan", "jpmorgan.com"],
  ["hsbc", "hsbc.com"],
  ["ubs", "ubs.com"],
  ["deka", "deka.de"],
  ["franklin", "franklintempleton.com"],
  ["wisdomtree", "wisdomtree.eu"],
  ["vaneck", "vaneck.com"],
  ["global x", "globalxetfs.com"],
  ["first trust", "ftportfolios.com"],
  ["pimco", "pimco.com"],
  ["schwab", "schwab.com"],
  ["bnp paribas", "bnpparibas.com"],
  ["credit suisse", "credit-suisse.com"],
  ["goldman sachs", "gsam.com"],
  ["21shares", "21shares.com"],
];

function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    // Os combinantes ficam em escapes: literais aqui seriam invisíveis no código.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * A gestora, quando o nome do produto a diz.
 *
 * `null` quando não diz — e nesse caso não se adivinha aqui. Um domínio errado
 * põe o logo de outra empresa numa posição de alguém, o que é pior do que umas
 * iniciais.
 */
export function gestoraDoNome(nome: string): string | null {
  const n = normalizar(nome);
  if (!n) return null;
  for (const [palavra, dominio] of GESTORAS) {
    if (n.includes(palavra)) return dominio;
  }
  return null;
}

/**
 * Um domínio aceitável, vindo de onde vier.
 *
 * Aceita-se `exemplo.com` e `www.exemplo.com`; recusa-se tudo o que traga
 * esquema, caminho, porta ou dois pontos. **A validação é aqui e não no sítio
 * onde se constrói o URL**: o domínio vai parar dentro de um endereço que o
 * servidor vai buscar, e um valor com barras lá dentro escolhe o caminho — e,
 * com um `@`, escolhe o servidor.
 */
export function dominioValido(bruto: string): string | null {
  const s = (bruto ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!s || s.length > 100) return null;
  // Letras, números, hífen e pontos; pelo menos um ponto; sem hífen nas pontas
  // de cada etiqueta e com um domínio de topo só de letras.
  if (!/^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))*\.[a-z]{2,}$/.test(s)) return null;
  return s;
}
