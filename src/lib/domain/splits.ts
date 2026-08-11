/**
 * Desdobramentos (*splits*): quando uma unidade passa a ser várias.
 *
 * **O problema, e porque é que ele não se resolvia com um aviso.** Uma
 * corretora regista um desdobramento como uma **venda e uma compra no mesmo
 * dia, pelo mesmo dinheiro**: saem 5 unidades, entram 100, e da conta não sai
 * nem entra um cêntimo. A app leu isso como dois negócios a sério, e daí saiu
 * tudo o resto:
 *
 * - a "venda" fabricou uma mais-valia realizada que nunca existiu;
 * - a "compra" entrou no investido como dinheiro que nunca saiu do banco — foi
 *   isto que pôs "1,4 milhões investidos" no ecrã;
 * - quando a corretora só exportou a perna da venda, a posição ficou a zero e o
 *   ativo passou a aparecer como **fechado**, escondido pelo filtro. Foi assim
 *   que a NVIDIA e a Google desapareceram da carteira;
 * - e a TWR dava ×20 exactos naquele dia, independentemente de qualquer preço.
 *
 * Até agora a app limitava-se a **recusar-se a calcular** quando detetava um.
 * Era honesto e não resolvia: os números continuavam errados nos outros ecrãs.
 *
 * **Como se resolve.** Um desdobramento não é um negócio, é uma mudança de
 * unidade de medida — como passar de metros para centímetros. Grava-se à parte,
 * com a data e o fator, e aplica-se às unidades de **tudo o que veio antes**:
 * as quantidades multiplicam, os preços por unidade dividem, e o dinheiro
 * investido não se mexe, que é exactamente o que aconteceu na realidade.
 *
 * **Porque é que tem de ser assim e não a reescrever os movimentos.** Reescrever
 * perde o que a corretora disse, e no dia em que o fator estiver errado já não
 * há como voltar atrás. O movimento fica como foi registado; o que muda é a
 * lente por onde se lê.
 *
 * **E as cotações?** As séries do Yahoo já vêm ajustadas a desdobramentos — os
 * preços antigos vêm divididos. Ao ajustar também as nossas unidades, os dois
 * lados passam a falar da mesma unidade. É esta incoerência, e não o split em
 * si, que a app detetava.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { Trade } from "./positions";

/**
 * `AssetSplit` e não `Split` porque `Split` já é a divisão de uma despesa
 * partilhada — a operação central da app. Dois tipos com o mesmo nome em
 * domínios diferentes é confusão garantida na primeira vez que os dois
 * aparecerem no mesmo ficheiro.
 */
export interface AssetSplit {
  id: string;
  assetId: string;
  /** "AAAA-MM-DD". A partir deste dia (inclusive) vale a nova unidade. */
  date: string;
  /**
   * Quantas unidades novas por cada unidade antiga.
   *
   * 20 num desdobramento de 20:1. **Um agrupamento inverso é uma fração**: um
   * 1:10 é `0,1`. Guardar isto como dois campos (antes/depois) parecia mais
   * legível e dava duas formas de escrever a mesma coisa — e a divisão acabava
   * feita à mão em cada sítio que precisasse dela.
   */
  ratio: number;
}

/** Fatores fora disto quase de certeza são um engano de quem escreveu. */
export const RATIO_MIN = 0.01;
export const RATIO_MAX = 1000;

export function ratioValido(r: number): boolean {
  return Number.isFinite(r) && r > 0 && r >= RATIO_MIN && r <= RATIO_MAX && r !== 1;
}

/**
 * O fator acumulado a aplicar a um movimento daquela data.
 *
 * Um ativo pode desdobrar mais do que uma vez, e os fatores multiplicam-se: uma
 * unidade comprada antes de um 2:1 e de um 10:1 vale hoje vinte. Só contam os
 * desdobramentos **posteriores** ao movimento — um que aconteceu antes já está
 * refletido nas unidades que a corretora registou nesse dia.
 */
export function fatorDepoisDe(splits: readonly AssetSplit[], date: string): number {
  let f = 1;
  for (const s of splits) {
    if (s.date > date) f *= s.ratio;
  }
  return f;
}

/**
 * Os movimentos vistos na unidade de hoje.
 *
 * **O dinheiro nunca muda.** Multiplica-se a quantidade e divide-se o preço por
 * unidade; o montante do movimento fica exactamente como foi. É o que torna
 * esta transformação segura: nenhuma soma de euros desta app se altera por
 * causa dela — só as contagens de unidades e o custo por unidade.
 */
export function aplicarSplits(trades: readonly Trade[], splits: readonly AssetSplit[]): Trade[] {
  if (splits.length === 0) return [...trades];
  return trades.map((t) => {
    const f = fatorDepoisDe(splits, t.date);
    if (f === 1) return t;
    return {
      ...t,
      quantity: t.quantity === null || t.quantity === undefined ? t.quantity : t.quantity * f,
      unitPriceCents:
        t.unitPriceCents === null || t.unitPriceCents === undefined
          ? t.unitPriceCents
          : Math.round(t.unitPriceCents / f),
    };
  });
}

/**
 * Um par de movimentos que tem todo o ar de ser um desdobramento por tratar.
 *
 * O que se procura é a assinatura exacta: **uma venda e uma compra no mesmo dia
 * e do mesmo ativo, pelo mesmo dinheiro, com quantidades diferentes**. Não é um
 * palpite sobre intenções — é uma operação que, tal como está registada, diz
 * que saíram X euros e entraram os mesmos X euros no mesmo dia, o que não é um
 * negócio que alguém faça.
 *
 * **O dinheiro tem de bater quase ao cêntimo.** Uma tolerância larga apanharia
 * uma venda e uma compra a sério feitas no mesmo dia por valores parecidos — e
 * transformá-las num desdobramento apagava uma mais-valia real. Aqui prefere-se
 * deixar passar um caso a estragar um.
 */
export interface SplitSugerido {
  vendaId: string;
  compraId: string;
  date: string;
  /** Unidades antes e depois, como estão registadas. */
  unidadesAntes: number;
  unidadesDepois: number;
  ratio: number;
}

/** Quanto o dinheiro das duas pernas pode diferir: um por mil. */
const TOLERANCIA = 0.001;

export function detetarSplits(trades: readonly Trade[]): SplitSugerido[] {
  const out: SplitSugerido[] = [];
  const vendas = trades.filter((t) => t.kind === "venda" && (t.quantity ?? 0) > 0);
  const compras = trades.filter((t) => t.kind === "compra" && (t.quantity ?? 0) > 0);
  const usadas = new Set<string>();

  for (const v of vendas) {
    const dinheiroV = montante(v);
    if (dinheiroV <= 0) continue;

    const par = compras.find((c) => {
      if (usadas.has(c.id) || c.date !== v.date) return false;
      const dinheiroC = montante(c);
      if (dinheiroC <= 0) return false;
      const diferenca = Math.abs(dinheiroC - dinheiroV) / dinheiroV;
      if (diferenca > TOLERANCIA) return false;
      // Mesmas unidades dos dois lados seria uma venda e uma recompra, não um
      // desdobramento — e essa é uma operação real que alguém pode ter feito.
      return (c.quantity ?? 0) !== (v.quantity ?? 0);
    });
    if (!par) continue;

    usadas.add(par.id);
    const antes = Math.abs(v.quantity ?? 0);
    const depois = Math.abs(par.quantity ?? 0);
    if (antes <= 0 || depois <= 0) continue;

    out.push({
      vendaId: v.id,
      compraId: par.id,
      date: v.date,
      unidadesAntes: antes,
      unidadesDepois: depois,
      ratio: depois / antes,
    });
  }

  return out;
}

function montante(t: Trade): number {
  if (t.amountCents) return Math.abs(Math.round(t.amountCents));
  const q = t.quantity ?? 0;
  const p = t.unitPriceCents ?? 0;
  return Math.abs(Math.round(q * p));
}

/** Como se escreve um fator: "20:1", ou "1:10" num agrupamento. */
export function ratioPorExtenso(ratio: number): string {
  if (ratio >= 1) {
    const r = Math.round(ratio * 100) / 100;
    return `${String(r).replace(".", ",")}:1`;
  }
  const inverso = Math.round((1 / ratio) * 100) / 100;
  return `1:${String(inverso).replace(".", ",")}`;
}
