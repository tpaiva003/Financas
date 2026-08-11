/**
 * Não importar duas vezes o mesmo movimento de corretora.
 *
 * **Isto faltava por inteiro.** As despesas têm dedup por UID estável desde o
 * primeiro dia; os movimentos de investimentos não tinham nada. Reimportar o
 * ficheiro de uma corretora — que é o gesto natural quando se quer só o que há
 * de novo — duplicava a carteira inteira: o dobro das unidades, o dobro do
 * investido, e uma posição que não existe.
 *
 * **As duas metades do invariante, e a segunda é a difícil.** A mesma transação
 * nunca entra duas vezes… e duas transações diferentes nunca viram uma. Duas
 * compras iguais no mesmo dia acontecem a sério: uma ordem grande executa em
 * várias parcelas, e a corretora exporta uma linha por parcela. Uma chave que
 * as juntasse fazia desaparecer metade do dinheiro, calada — que é exactamente
 * o modo de falha que esta app já pagou para aprender com os dois cafés iguais.
 *
 * **Como se resolve sem chave nenhuma nova.** Contam-se. Para cada assinatura
 * (mesmo ativo, dia, tipo, unidades e montante), vê-se quantas linhas já
 * existem e quantas o ficheiro traz; importa-se a diferença. Reimportar o mesmo
 * ficheiro dá diferença zero; um ficheiro com uma parcela nova dá um; uma
 * primeira importação com duas parcelas iguais dá duas.
 *
 * É mais simples do que um UID e responde melhor: não precisa de coluna nova,
 * não precisa de migração, e não tem o problema de decidir o que entra na
 * chave — porque a chave é a linha toda.
 *
 * Lógica pura, sem acesso a dados.
 */

/** O que basta saber de um movimento para o reconhecer. */
export interface MovimentoComparavel {
  date: string;
  kind: string;
  quantity?: number | null;
  amountCents: number;
}

/**
 * A assinatura de um movimento.
 *
 * As unidades entram arredondadas a seis casas: uma fração de ETF vem com
 * dízimas, e duas leituras do mesmo número podem diferir no último bit sem
 * serem movimentos diferentes.
 */
export function assinatura(m: MovimentoComparavel): string {
  const q = m.quantity === null || m.quantity === undefined ? "" : m.quantity.toFixed(6);
  return [m.date, m.kind, q, Math.round(m.amountCents)].join("|");
}

export interface Repeticoes<T> {
  /** Os que ainda não existem e devem ser gravados. */
  novos: T[];
  /** Quantos vinham no ficheiro e já lá estavam. */
  repetidos: number;
}

/**
 * O que do ficheiro ainda não está registado.
 *
 * A ordem dos novos é a do ficheiro: quando há duas parcelas iguais e só uma
 * está registada, importa-se a **última** das do ficheiro, o que não faz
 * diferença nenhuma no resultado e mantém a leitura previsível.
 */
export function movimentosNovos<T extends MovimentoComparavel>(
  existentes: readonly MovimentoComparavel[],
  doFicheiro: readonly T[],
): Repeticoes<T> {
  const porAssinatura = new Map<string, number>();
  for (const e of existentes) {
    const k = assinatura(e);
    porAssinatura.set(k, (porAssinatura.get(k) ?? 0) + 1);
  }

  const novos: T[] = [];
  let repetidos = 0;
  for (const t of doFicheiro) {
    const k = assinatura(t);
    const restam = porAssinatura.get(k) ?? 0;
    if (restam > 0) {
      // Já há uma linha por conta desta: consome-se e não se importa.
      porAssinatura.set(k, restam - 1);
      repetidos += 1;
      continue;
    }
    novos.push(t);
  }

  return { novos, repetidos };
}
