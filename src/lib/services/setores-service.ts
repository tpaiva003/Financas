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
 */

import { getRepository } from "@/lib/data";
import { buscarFundamentais } from "./fundamentais-service";

export interface SetoresAtualizados {
  /** Quantos investimentos foram consultados. */
  consultados: number;
  /** Quantos ficaram com setor. */
  gravados: number;
  /** Consultados com sucesso, mas a fonte não classifica (fundos, sobretudo). */
  semSetorNaFonte: number;
  /** Quantos não deram resposta nenhuma. Esses repetem-se para a próxima. */
  falhados: number;
}

/**
 * Um tecto por passagem, pela mesma razão do património.
 *
 * Uma carteira com cinquenta investimentos sem setor dava cinquenta idas à rede
 * em série dentro de uma função com tempo limitado — que estoirava o prazo e
 * não gravava nada. Assim cada carregar no botão trata um lote e diz quantos
 * ficaram para trás.
 */
const MAX_POR_PASSAGEM = 12;

export async function atualizarSetores(spaceId: string): Promise<SetoresAtualizados> {
  const repo = getRepository();
  const agora = new Date();

  const bens = await repo.listAssets(spaceId).catch(() => []);
  const candidatos = bens
    .filter(
      (a) =>
        a.kind === "investimento" &&
        a.symbol &&
        !a.sector &&
        // Já se perguntou e a fonte não soube. Voltar a perguntar em cada
        // passagem gastava a fonte para ouvir a mesma coisa.
        !a.profileAt,
    )
    .slice(0, MAX_POR_PASSAGEM);

  let gravados = 0;
  let semSetorNaFonte = 0;
  let falhados = 0;

  for (const a of candidatos) {
    const r = await buscarFundamentais(a.symbol!).catch(() => null);
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

  return { consultados: candidatos.length, gravados, semSetorNaFonte, falhados };
}

/** Quantos investimentos ainda esperam por uma consulta ao perfil. */
export function porConsultar(
  bens: readonly { kind: string; symbol?: string | null; sector?: string | null; profileAt?: string | null }[],
): number {
  return bens.filter((a) => a.kind === "investimento" && a.symbol && !a.sector && !a.profileAt)
    .length;
}
