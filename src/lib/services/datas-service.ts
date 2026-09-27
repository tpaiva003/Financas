/**
 * Ir buscar as datas de mercado dos investimentos em carteira.
 *
 * Usa a mesma fonte das contas (`quoteSummary`, módulo `calendarEvents`) e o
 * mesmo leitor: as datas já vinham lá e eram deitadas fora depois de aparecerem
 * no ecrã da avaliação. Aqui ficam gravadas, que é o que permite avisar sem
 * alguém estar a olhar para a empresa — e um aviso que só existe enquanto se
 * está a olhar não avisa nada.
 *
 * **Uma vez por semana e por símbolo.** Estas datas mudam quatro vezes por ano;
 * ir buscá-las a cada visita era gastar a fonte por nada. Ver `precisaDeDatas`.
 *
 * **Uma falha não apaga o que já se sabia.** Se a fonte não responder, fica a
 * data anterior e o carimbo antigo — o ecrã continua a mostrar o que tinha, com
 * a idade que tem. Escrever `null` por cima transformava um problema de rede
 * numa empresa que aparentemente deixou de pagar dividendo.
 */

import { getRepository } from "@/lib/data";
import { precisaDeDatas } from "@/lib/domain";
import {
  TIMEOUT_EM_LOTE_MS,
  buscarFundamentais,
  sessaoAnonima,
  type SessaoYahoo,
} from "./fundamentais-service";

/** O tempo que a passagem tem, ao todo. Ver o comentário lá em baixo. */
const ORCAMENTO_MS = 8_000;

export interface DatasAtualizadas {
  /** Quantos investimentos foram consultados nesta passagem. */
  consultados: number;
  /** Quantos ficaram com datas novas. */
  gravados: number;
  /** Quantos não deram, e o ecrã diz porquê. */
  falhados: number;
}

/**
 * Põe as datas em dia, só para quem precisa.
 *
 * Devolve o que fez, para o ecrã poder ser honesto sobre o que ficou de fora.
 */
export async function atualizarDatasDeMercado(
  spaceId: string,
  options: { force?: boolean } = {},
): Promise<DatasAtualizadas> {
  const repo = getRepository();
  const agora = new Date();

  const bens = await repo.listAssets(spaceId).catch(() => []);
  const candidatos = bens.filter(
    (a) =>
      a.kind === "investimento" &&
      a.symbol &&
      // Uma posição fechada continua a apresentar resultados, e isso não é
      // assunto de quem já não a tem.
      (a.quantity ?? 0) > 0 &&
      (options.force || precisaDeDatas(a.marketDatesAt, agora)),
  );

  /**
   * Uma sessão para a passagem toda, e um tecto de tempo por pedido.
   *
   * A primeira versão pedia uma sessão nova por investimento — mais dois
   * pedidos cada — e dava doze segundos a cada um. Numa carteira com uma dúzia
   * de posições isso não cabe no tempo de vida da função, e o que se via do
   * lado de fora era nada feito e nenhuma explicação. Ver o cabeçalho do
   * `setores-service`, onde a mesma coisa aconteceu a sério.
   */
  const sessao: SessaoYahoo | null = await sessaoAnonima().catch(() => null);
  const ate = Date.now() + ORCAMENTO_MS;

  let gravados = 0;
  let falhados = 0;

  for (const a of candidatos) {
    // Antes de entrar em mais um, e não depois: começar um pedido de cinco
    // segundos com dois de orçamento é como não ter relógio nenhum.
    if (Date.now() + TIMEOUT_EM_LOTE_MS > ate) break;

    const r = await buscarFundamentais(a.symbol!, {
      sessao,
      timeoutMs: TIMEOUT_EM_LOTE_MS,
      maxCandidatos: 2,
    }).catch(() => null);
    if (!r?.dados) {
      falhados += 1;
      continue;
    }

    const { resultados, dividendo, exDividendo } = r.dados.datas;
    try {
      await repo.updateAsset(a.id, spaceId, {
        nextEarningsDate: resultados,
        dividendDate: dividendo,
        exDividendDate: exDividendo,
        // O carimbo só se escreve quando a consulta correu: senão, uma fonte em
        // baixo adiava a tentativa seguinte por uma semana.
        marketDatesAt: agora.toISOString(),
        /**
         * O setor vem de borla nesta mesma resposta — o `assetProfile` vai no
         * mesmo pedido — e por isso aproveita-se em vez de se gastar outra ida
         * à fonte para o ir buscar.
         *
         * **Só onde está vazio.** Um setor escrito à mão nunca é reescrito por
         * esta passagem: é o invariante das entradas manuais, que não são
         * reclassificadas automaticamente. E o `profileAt` acompanha o que se
         * escreveu, para não carimbar uma consulta que não mexeu em nada.
         */
        ...(a.sector
          ? {}
          : {
              sector: r.dados.setor,
              industry: r.dados.industria,
              profileAt: agora.toISOString(),
            }),
      });
      gravados += 1;
    } catch {
      falhados += 1;
    }
  }

  // `gravados + falhados` e não `candidatos.length`: com o relógio a cortar a
  // passagem a meio, o comprimento da lista contava como consultados os que
  // nunca chegaram a ser perguntados.
  return { consultados: gravados + falhados, gravados, falhados };
}
