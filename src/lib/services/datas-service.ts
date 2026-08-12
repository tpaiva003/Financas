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
import { buscarFundamentais } from "./fundamentais-service";

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

  let gravados = 0;
  let falhados = 0;

  for (const a of candidatos) {
    const r = await buscarFundamentais(a.symbol!).catch(() => null);
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
      });
      gravados += 1;
    } catch {
      falhados += 1;
    }
  }

  return { consultados: candidatos.length, gravados, falhados };
}
