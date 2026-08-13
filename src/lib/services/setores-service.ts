/**
 * Ir buscar o setor dos investimentos que ainda não o têm.
 *
 * Usa a mesma fonte das contas (`quoteSummary`, módulo `assetProfile`) e o
 * mesmo leitor. Existe à parte da atualização das datas de mercado por duas
 * razões: aquela só corre uma vez por semana e só para posições **abertas**, e
 * a exposição por setor conta com a carteira toda que ainda vale alguma coisa.
 *
 * **Só preenche o que está vazio.** Um setor escrito à mão nunca é reescrito —
 * é o invariante das entradas manuais, que não são reclassificadas
 * automaticamente. Quem discorda da classificação da fonte corrige-a uma vez e
 * ela fica.
 *
 * **Um ETF sem setor não é uma falha.** A fonte não classifica fundos por
 * setor, e insistir com eles a cada passagem gastava a fonte para nada. Por
 * isso o carimbo escreve-se mesmo quando a resposta vem sem setor: a pergunta
 * foi feita e teve resposta, que foi "não sei". O que não se escreve é o
 * carimbo de uma consulta que **falhou** — essa tem de se poder repetir.
 *
 * ## O que a primeira versão disto fez, e não se repete
 *
 * Percorria doze investimentos chamando `buscarFundamentais` como o botão de
 * uma empresa a chama: **sessão nova a cada um** (mais dois pedidos), **todas
 * as formas do ticker** (até quatro) e **doze segundos de tolerância** em cada
 * pedido. São mais de cem chamadas ao Yahoo e minutos de espera dentro de uma
 * função que vive dez segundos.
 *
 * O resultado não foi "gravei metade". Foi **zero**: a função morria antes da
 * primeira escrita, e do lado de fora via-se um botão que não fazia nada e uma
 * tabela que continuava a dizer "por classificar". Um trabalho em lote tem de
 * caber no tempo que tem — e quando não cabe, tem de gravar o que fez e dizer o
 * que ficou por fazer.
 */

import { getRepository } from "@/lib/data";
import {
  TIMEOUT_EM_LOTE_MS,
  buscarFundamentais,
  sessaoAnonima,
  type SessaoYahoo,
} from "./fundamentais-service";

export interface SetoresAtualizados {
  /** Quantos investimentos foram consultados nesta passagem. */
  consultados: number;
  /** Quantos ficaram com setor. */
  gravados: number;
  /** Consultados com sucesso, mas a fonte não classifica (fundos, sobretudo). */
  semSetorNaFonte: number;
  /** Quantos não deram resposta nenhuma. Esses repetem-se para a próxima. */
  falhados: number;
  /** Quantos ficaram por consultar, de todo. Zero quando não sobrou nenhum. */
  porFazer: number;
  /** Parou por ter acabado o tempo, e não por ter acabado a lista. */
  faltouTempo: boolean;
}

/**
 * Quanto tempo o lote tem, ao todo.
 *
 * Uma Server Action da Vercel vive poucos segundos. Este relógio existe para a
 * passagem **acabar por decisão própria**, com o que gravou já gravado e uma
 * mensagem a dizer quantos faltam — em vez de ser interrompida a meio e não
 * deixar nem escrita nem explicação.
 */
const ORCAMENTO_MS = 8_000;

/** Um tecto na mesma, por cima do relógio: nunca mais do que isto por lote. */
const MAX_POR_PASSAGEM = 8;

export async function atualizarSetores(spaceId: string): Promise<SetoresAtualizados> {
  const repo = getRepository();
  const agora = new Date();
  const ate = Date.now() + ORCAMENTO_MS;

  const bens = await repo.listAssets(spaceId).catch(() => []);
  const candidatos = bens.filter(
    (a) =>
      a.kind === "investimento" &&
      a.symbol &&
      !a.sector &&
      // Já se perguntou e a fonte não soube. Voltar a perguntar em cada
      // passagem gastava a fonte para ouvir a mesma coisa.
      !a.profileAt,
  );
  if (candidatos.length === 0) {
    return {
      consultados: 0,
      gravados: 0,
      semSetorNaFonte: 0,
      falhados: 0,
      porFazer: 0,
      faltouTempo: false,
    };
  }

  /**
   * Uma sessão para o lote todo.
   *
   * Se não sair, tenta-se na mesma sem ela: o caminho aberto do `quoteSummary`
   * às vezes responde, e desistir aqui transformava um "talvez" num "não".
   */
  const sessao: SessaoYahoo | null = await sessaoAnonima().catch(() => null);

  let consultados = 0;
  let gravados = 0;
  let semSetorNaFonte = 0;
  let falhados = 0;
  let faltouTempo = false;

  for (const a of candidatos.slice(0, MAX_POR_PASSAGEM)) {
    // O relógio verifica-se ANTES de começar mais um, e não depois: entrar num
    // pedido de cinco segundos com dois de orçamento é como não ter relógio.
    if (Date.now() + TIMEOUT_EM_LOTE_MS > ate) {
      faltouTempo = true;
      break;
    }

    consultados += 1;
    const r = await buscarFundamentais(a.symbol!, {
      sessao,
      timeoutMs: TIMEOUT_EM_LOTE_MS,
      // Duas formas do ticker chegam para o caso normal. A terceira e a quarta
      // custam o tempo de que o investimento seguinte precisa para ser
      // consultado de todo, e quem ficar de fora repete-se à próxima.
      maxCandidatos: 2,
    }).catch(() => null);

    if (!r?.dados) {
      // Sem resposta não se carimba nada: a pergunta não chegou a ser feita.
      falhados += 1;
      continue;
    }

    try {
      await repo.updateAsset(a.id, spaceId, {
        sector: r.dados.setor,
        industry: r.dados.industria,
        profileAt: agora.toISOString(),
      });
      if (r.dados.setor) gravados += 1;
      else semSetorNaFonte += 1;
    } catch {
      falhados += 1;
    }
  }

  return {
    consultados,
    gravados,
    semSetorNaFonte,
    falhados,
    porFazer: candidatos.length - consultados,
    faltouTempo,
  };
}

/** Quantos investimentos ainda esperam por uma consulta ao perfil. */
export function porConsultar(
  bens: readonly { kind: string; symbol?: string | null; sector?: string | null; profileAt?: string | null }[],
): number {
  return bens.filter((a) => a.kind === "investimento" && a.symbol && !a.sector && !a.profileAt)
    .length;
}
