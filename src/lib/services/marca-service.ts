/**
 * Descobrir de que marca é um investimento, para lhe pôr o logo.
 *
 * **A tabela primeiro, o modelo só para o que sobra.** Os ETF trazem a gestora
 * no nome e há uma dúzia de gestoras a cobrir quase tudo o que se compra na
 * Europa: esses saem de uma tabela, de graça, sem espera e sem poder errar. O
 * que sobra são ações de empresas, onde o nome não diz o domínio — e aí sim vale
 * a pena perguntar.
 *
 * **O modelo propõe, o domínio é verificado.** Um domínio inventado dá um
 * quadrado partido, o que é feio; um domínio de outra empresa dá o logo errado
 * numa posição de alguém, o que é pior do que umas iniciais. A verificação é
 * simples e decisiva: se a fonte de ícones não devolve imagem para aquele
 * domínio, o domínio não vale.
 *
 * É a mesma divisão de trabalho da sugestão de tickers, e pela mesma razão: o
 * modelo é bom a ligar um nome comercial a uma marca e péssimo a saber se ela
 * existe.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { dominioValido, gestoraDoNome } from "@/lib/domain";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 60_000;
/** Quantos nomes se mandam de uma vez. Chega para uma carteira inteira. */
const MAX_POR_CHAMADA = 40;

const Resposta = z.object({
  marcas: z
    .array(
      z.object({
        nome: z.string().describe("O nome do produto, tal como o recebeste."),
        dominio: z
          .string()
          .describe(
            "O domínio do site oficial da empresa ou gestora, sem esquema nem caminho: 'apple.com'. String vazia se não souberes.",
          ),
      }),
    )
    .describe("Um por cada nome recebido, pela mesma ordem."),
});

const INSTRUCOES = `Recebes nomes de produtos financeiros tal como vêm num extrato de corretora e dizes o domínio do site oficial da empresa ou da gestora a que pertencem. Serve só para mostrar um logo.

Regras:
- Devolve o domínio principal da marca, sem "https://" e sem caminho: "apple.com", "nvidia.com", "galp.pt".
- Se for um fundo ou ETF, o domínio é o da GESTORA e não o do que o índice segue. Um ETF da iShares sobre a Apple é da iShares.
- Se não souberes, devolve string vazia. Nunca inventes um domínio para não vir de mãos vazias: um domínio inventado dá um quadrado partido, e um domínio de outra empresa põe o logo errado numa carteira. Vazio é uma resposta perfeitamente aceitável.
- Os nomes vêm truncados, em maiúsculas e sem pontuação. Não peças esclarecimentos: responde ao que conseguires e deixa o resto vazio.
- Se o nome for de uma conta, de um depósito ou de um saldo de tesouraria, devolve vazio.`;

export function marcaLookupAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * O domínio existe mesmo, ou pelo menos tem ícone?
 *
 * Não prova que é a empresa certa — nada prova isso sem um humano — mas apanha
 * o inventado, que é o caso comum de um modelo a tentar ser prestável.
 */
async function temIcone(dominio: string): Promise<boolean> {
  try {
    const controlo = new AbortController();
    const t = setTimeout(() => controlo.abort(), 5_000);
    const res = await fetch(`https://icons.duckduckgo.com/ip3/${dominio}.ico`, {
      signal: controlo.signal,
    });
    clearTimeout(t);
    if (!res.ok) return false;
    return (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

export interface MarcaEncontrada {
  nome: string;
  dominio: string;
  /** Veio da tabela de gestoras, ou do modelo? Serve para o ecrã explicar. */
  origem: "tabela" | "modelo";
}

/**
 * Os domínios para uma lista de nomes.
 *
 * Nunca atira. Um nome sem resposta fica de fora — a carteira mostra o
 * monograma, que é o que já mostrava.
 */
export async function descobrirMarcas(nomes: readonly string[]): Promise<MarcaEncontrada[]> {
  const out: MarcaEncontrada[] = [];
  const porPerguntar: string[] = [];

  for (const nome of nomes) {
    const daTabela = gestoraDoNome(nome);
    if (daTabela) out.push({ nome, dominio: daTabela, origem: "tabela" });
    else porPerguntar.push(nome);
  }

  if (porPerguntar.length === 0 || !marcaLookupAvailable()) return out;

  let propostas: { nome: string; dominio: string }[] = [];
  try {
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
    const r = await client.messages.parse({
      model: MODELO,
      max_tokens: 4_000,
      system: INSTRUCOES,
      // Ligar um nome a uma marca é conhecimento, não raciocínio longo.
      output_config: { effort: "low", format: zodOutputFormat(Resposta) },
      messages: [{ role: "user", content: porPerguntar.slice(0, MAX_POR_CHAMADA).join("\n") }],
    });
    if (r.stop_reason === "refusal") return out;
    propostas = r.parsed_output?.marcas ?? [];
  } catch {
    // Sem modelo, fica o que a tabela deu. Ver o cabeçalho.
    return out;
  }

  // A verificação corre em paralelo: são pedidos curtos e são muitos.
  const verificadas = await Promise.all(
    propostas.map(async (p) => {
      const d = dominioValido(p.dominio ?? "");
      if (!d) return null;
      return (await temIcone(d)) ? { nome: p.nome, dominio: d, origem: "modelo" as const } : null;
    }),
  );

  for (const v of verificadas) {
    if (v) out.push(v);
  }
  return out;
}
