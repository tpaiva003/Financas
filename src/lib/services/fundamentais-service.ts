/**
 * Ir buscar as contas de uma empresa ao Yahoo Finance.
 *
 * A rede fica aqui; a leitura do formato está no domínio, em funções puras com
 * testes. É a mesma divisão das cotações e da Euribor, e pela mesma razão: um
 * formato que muda tem de se poder exercitar sem rede.
 *
 * **O `quoteSummary` não é o `chart`.** As cotações vêm de um caminho aberto; as
 * contas vêm de um que pede um `crumb` — um valor que se obtém de uma sessão
 * anónima e que acompanha o pedido. Sem ele a resposta é 401, e é isso que faz
 * este ficheiro ter duas voltas em vez de uma. A primeira tentativa vai sem
 * `crumb` de propósito: quando o caminho aberto funciona, poupa-se-lhe duas
 * chamadas.
 *
 * **Nunca inventa, e diz sempre porque é que não deu.** Se a fonte recusar,
 * devolve-se o motivo por extenso e os campos ficam para escrever à mão, como já
 * se escreviam. Um número aqui não é um número qualquer: entra num DCF, é
 * multiplicado por dez anos de crescimento composto e sai do outro lado como
 * "esta ação vale 492 €".
 */

import {
  parseFundamentais,
  symbolCandidates,
  normalizeSymbol,
  urlDosFundamentais,
  type Fundamentais,
} from "@/lib/domain";

const TIMEOUT_MS = 12_000;
/**
 * O tecto de tempo quando se percorrem muitos símbolos de seguida.
 *
 * Doze segundos por pedido é generoso para quem carregou num botão e está a
 * olhar para uma empresa. Num lote de doze é o que mata a função inteira antes
 * de ela gravar o primeiro registo — e o resultado não é "gravei metade", é
 * "não gravei nada e ninguém sabe porquê".
 */
export const TIMEOUT_EM_LOTE_MS = 5_000;
const AGENTE = "Mozilla/5.0 (compatible; Rachar/1.0; +https://rachar.pt)";

export interface FundamentaisResult {
  /** O símbolo que a fonte acabou por reconhecer. */
  simbolo: string | null;
  dados: Fundamentais | null;
  problem: string | null;
}

async function pedir(
  url: string,
  cookie: string | null,
  aceita: string,
  /**
   * As contas de uma empresa mudam quatro vezes por ano e podem ficar em cache.
   * **O cookie e o `crumb` não podem**: são uma sessão, e uma sessão guardada
   * uma hora emparelha um cookie velho com um `crumb` novo — o que dá 401 para
   * sempre, e um 401 permanente lê-se como "esta empresa não existe".
   */
  guardar: boolean,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response | null> {
  const controlo = new AbortController();
  const t = setTimeout(() => controlo.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controlo.signal,
      headers: {
        accept: aceita,
        "user-agent": AGENTE,
        ...(cookie ? { cookie } : {}),
      },
      ...(guardar ? { next: { revalidate: 3_600 } } : { cache: "no-store" as const }),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * A sessão anónima que o `quoteSummary` exige.
 *
 * O primeiro pedido serve só para receber o cookie — responde 404 e isso é
 * normal, o que interessa é o cabeçalho. O segundo troca o cookie pelo `crumb`.
 * Se qualquer um dos dois falhar, devolve-se `null` e quem chama desiste com uma
 * mensagem, em vez de repetir o pedido que já se sabe que vai dar 401.
 */
export interface SessaoYahoo {
  cookie: string;
  crumb: string;
}

/**
 * **Reutiliza-se num lote, e é para isso que está exportada.**
 *
 * Uma sessão por símbolo eram mais dois pedidos por investimento. Numa passagem
 * por doze, isso são vinte e quatro chamadas só para dizer quem somos — e o
 * Yahoo trava quem lhe bate à porta assim. Uma sessão serve o lote todo.
 */
export async function sessaoAnonima(): Promise<SessaoYahoo | null> {
  const inicial = await pedir("https://fc.yahoo.com/", null, "text/html", false);
  const bruto = inicial?.headers.get("set-cookie");
  if (!bruto) return null;
  // Só o par nome=valor de cada cookie; os atributos (`Path`, `Expires`) não
  // vão no pedido de volta e alguns servidores rejeitam-nos se forem.
  const cookie = bruto
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) return null;

  const res = await pedir(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    cookie,
    "text/plain",
    false,
  );
  if (!res || !res.ok) return null;
  const crumb = (await res.text()).trim();
  // Uma página de bloqueio também responde 200. Um `crumb` é curto e não tem
  // espaços; qualquer outra coisa é lixo com ar de resposta.
  if (!crumb || crumb.length > 64 || /[<\s]/.test(crumb)) return null;
  return { cookie, crumb };
}

/** Uma tentativa num símbolo, já lida. */
async function tentar(
  simbolo: string,
  sessao: SessaoYahoo | null,
  timeoutMs: number,
): Promise<{ dados: Fundamentais | null; motivo: string | null; precisaCrumb: boolean }> {
  // `urlDosFundamentais` traduz o símbolo interno para o que a fonte conhece.
  // Sem isso, `googl.us` ia em cru e o Yahoo respondia 404 a tudo.
  const res = await pedir(
    urlDosFundamentais(simbolo, sessao?.crumb ?? null),
    sessao?.cookie ?? null,
    "application/json",
    true,
    timeoutMs,
  );
  if (!res) return { dados: null, motivo: "não consegui falar com o Yahoo Finance", precisaCrumb: false };
  // 401 e 403 são a falta de `crumb`; 404 é o símbolo que não existe. São
  // problemas opostos — um resolve-se com outra volta, o outro corrigindo o
  // ticker — e confundi-los mandava corrigir o que estava certo.
  if (res.status === 401 || res.status === 403) {
    return { dados: null, motivo: `o Yahoo respondeu ${res.status}`, precisaCrumb: true };
  }
  if (!res.ok) {
    return { dados: null, motivo: `o Yahoo respondeu ${res.status}`, precisaCrumb: false };
  }

  const texto = await res.text();
  const dados = parseFundamentais(texto);
  // Sem historial e sem um único campo do topo, não veio nada de útil — e isso
  // é indistinguível de um símbolo que a fonte não conhece.
  const vazio =
    dados.historico.length === 0 &&
    dados.fcfBilioes === null &&
    dados.acoesBilioes === null &&
    dados.precoUnidade === null;
  if (vazio) {
    return { dados: null, motivo: `o Yahoo não conhece "${simbolo}"`, precisaCrumb: false };
  }
  return { dados, motivo: null, precisaCrumb: false };
}

/**
 * As contas de uma empresa, pelo seu símbolo.
 *
 * Tenta as formas prováveis do ticker, como as cotações fazem: quem escreve
 * "MSFT" quer a Microsoft, e a fonte só a encontra por um dos nomes que ela
 * própria usa.
 */
export async function buscarFundamentais(
  bruto: string,
  opcoes: {
    /**
     * Uma sessão já obtida, para não a pedir outra vez.
     *
     * Existe por causa dos lotes: sem isto, percorrer doze investimentos eram
     * mais vinte e quatro chamadas ao Yahoo só para dizer quem somos.
     */
    sessao?: SessaoYahoo | null;
    timeoutMs?: number;
    /**
     * Quantas formas do ticker tentar.
     *
     * Quem carrega no botão de uma empresa quer que se tente tudo. Num lote, a
     * quarta tentativa de um símbolo que a fonte não conhece custa o tempo que
     * o décimo investimento precisava para ser consultado de todo.
     */
    maxCandidatos?: number;
  } = {},
): Promise<FundamentaisResult> {
  const base = normalizeSymbol(bruto);
  if (!base) return { simbolo: null, dados: null, problem: "Símbolo inválido." };

  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS;
  const candidatos = symbolCandidates(base).slice(0, opcoes.maxCandidatos ?? Infinity);
  let sessao: SessaoYahoo | null = opcoes.sessao ?? null;
  const motivos: string[] = [];

  for (const c of candidatos) {
    let r = await tentar(c, sessao, timeoutMs);

    if (r.precisaCrumb) {
      // Uma só vez por chamada: se a sessão não sair, não é o símbolo seguinte
      // que a arranja.
      sessao ??= await sessaoAnonima();
      if (!sessao) {
        return {
          simbolo: null,
          dados: null,
          problem:
            "O Yahoo Finance pediu uma sessão para devolver as contas e não ma deu. As cotações continuam a funcionar: isto afeta só os dados financeiros. Escreve os campos à mão por agora.",
        };
      }
      r = await tentar(c, sessao, timeoutMs);
    }

    if (r.dados) return { simbolo: c, dados: r.dados, problem: null };
    if (r.motivo) motivos.push(r.motivo);
  }

  return {
    simbolo: null,
    dados: null,
    // O motivo por extenso: "não encontrei" acusa o símbolo, e muitas vezes o
    // símbolo está certo e quem recusou foi a fonte.
    problem: `Não consegui obter as contas: ${[...new Set(motivos)].join("; ") || "sem resposta da fonte"}.`,
  };
}
