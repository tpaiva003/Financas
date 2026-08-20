/**
 * Três cenários, com probabilidades, margem de segurança e um veredicto.
 *
 * **Porque é que um DCF só não chega.** Um cálculo dá um número; a decisão
 * precisa de um intervalo com pesos. Projetar 15% ao ano e concluir que a ação
 * está barata é fácil — o difícil é dizer quanto se acredita nesse 15% ao lado
 * dos outros dois futuros possíveis. Aqui os três coexistem, cada um com a
 * probabilidade que quem decide lhes dá, e o resultado é uma média pesada.
 *
 * **A margem de segurança aplica-se ANTES da comparação com o preço, não
 * depois.** É a diferença entre "vale 492 e custa 410, está barata" e "só a
 * compro abaixo de 344, e custa 410, logo não". A margem não é um ajuste
 * cosmético no fim: é o preço a que se está disposto a comprar, e é esse que
 * entra na conta.
 *
 * **As probabilidades têm de somar cem.** Se não somarem, a média pesada sai
 * silenciosamente errada — 25/50/20 dá um valor 5% abaixo do verdadeiro e nada
 * no ecrã denuncia que faltavam cinco pontos. Recusa-se em vez de normalizar:
 * normalizar esconde o engano de quem escreveu e devolve um número que ele não
 * pediu.
 *
 * Lógica pura, sem acesso a dados.
 */

import { calcularDcf, type DcfInput, type DcfResultado } from "./dcf";

export type CenarioId = "baixo" | "medio" | "alto";

export interface CenarioDcf {
  id: CenarioId;
  /** Crescimento anual da primeira fase (tipicamente anos 1-5). */
  crescimentoPct: number;
  /** Crescimento anual da segunda fase (tipicamente anos 6-10). */
  crescimentoTardioPct: number;
  /** Quanto se acredita neste cenário, em percentagem. */
  probabilidadePct: number;
}

export const CENARIO_LABELS: Record<CenarioId, string> = {
  baixo: "Pessimista",
  medio: "Central",
  alto: "Otimista",
};

export interface CenarioAvaliado {
  id: CenarioId;
  label: string;
  probabilidadePct: number;
  resultado: DcfResultado;
  /** O valor intrínseco por ação, sem margem. */
  valorPorAcaoCents: number;
  /** O mesmo, já com a margem de segurança descontada: o preço a que se compra. */
  comMargemCents: number;
  /** Quanto o preço de compra está acima ou abaixo do preço de mercado. */
  upsidePct: number | null;
}

export interface AvaliacaoPonderada {
  cenarios: CenarioAvaliado[];
  /** A média dos preços de compra, pesada pelas probabilidades. */
  precoPonderadoCents: number;
  /** Face ao preço de mercado. `null` sem preço. */
  upsidePonderadoPct: number | null;
  /**
   * Vale a pena ao preço de hoje?
   *
   * `null` sem preço de mercado: sem ele não há nada a comparar, e um veredicto
   * sem termo de comparação seria uma opinião com ar de conta.
   */
  atrativo: boolean | null;
  margemPct: number;
}

export type AvaliacaoSaida = { ok: AvaliacaoPonderada } | { erro: string };

/** Quanto as probabilidades podem falhar dos cem, por arredondamento. */
const TOLERANCIA_PCT = 0.5;

export function avaliarCenarios(input: {
  /** Tudo o que não muda entre cenários: fluxo, ações, dívida, desconto. */
  base: Omit<DcfInput, "crescimentoPct" | "crescimentoTardioPct">;
  cenarios: readonly CenarioDcf[];
  /** Margem de segurança em percentagem: 30 quer dizer comprar 30% abaixo. */
  margemPct: number;
}): AvaliacaoSaida {
  const { base, cenarios, margemPct } = input;

  if (cenarios.length === 0) return { erro: "Não há cenários nenhuns para avaliar." };
  if (!Number.isFinite(margemPct) || margemPct < 0 || margemPct >= 100) {
    return { erro: "A margem de segurança tem de estar entre 0% e 100%." };
  }

  const soma = cenarios.reduce((s, c) => s + (Number.isFinite(c.probabilidadePct) ? c.probabilidadePct : 0), 0);
  if (Math.abs(soma - 100) > TOLERANCIA_PCT) {
    return {
      erro: `As probabilidades somam ${Math.round(soma * 10) / 10}% e têm de somar 100%. Não normalizo sozinho: a média pesada sairia certa e diferente da que escreveste, sem nada no ecrã a dizer que faltavam pontos.`,
    };
  }

  const avaliados: CenarioAvaliado[] = [];
  for (const c of cenarios) {
    const r = calcularDcf({
      ...base,
      crescimentoPct: c.crescimentoPct,
      crescimentoTardioPct: c.crescimentoTardioPct,
    });
    if ("erro" in r) {
      return { erro: `Cenário ${CENARIO_LABELS[c.id].toLowerCase()}: ${r.erro}` };
    }

    const valor = r.ok.valorPorAcaoCents;
    const comMargem = Math.round(valor * (1 - margemPct / 100));
    const preco = base.precoAtualCents ?? null;
    avaliados.push({
      id: c.id,
      label: CENARIO_LABELS[c.id],
      probabilidadePct: c.probabilidadePct,
      resultado: r.ok,
      valorPorAcaoCents: valor,
      comMargemCents: comMargem,
      // Contra o preço COM margem: é esse o preço a que se está disposto a
      // comprar, e é a comparação que decide.
      upsidePct: preco !== null && preco > 0 ? Math.round(((comMargem - preco) / preco) * 1000) / 10 : null,
    });
  }

  const precoPonderado = Math.round(
    avaliados.reduce((s, c) => s + c.comMargemCents * (c.probabilidadePct / 100), 0),
  );
  const preco = base.precoAtualCents ?? null;
  const upside =
    preco !== null && preco > 0
      ? Math.round(((precoPonderado - preco) / preco) * 1000) / 10
      : null;

  return {
    ok: {
      cenarios: avaliados,
      precoPonderadoCents: precoPonderado,
      upsidePonderadoPct: upside,
      // Sem preço não há veredicto. Ver o comentário no tipo.
      atrativo: upside === null ? null : upside >= 0,
      margemPct,
    },
  };
}

/** Os três cenários por omissão, para o formulário não nascer vazio. */
export const CENARIOS_POR_OMISSAO: CenarioDcf[] = [
  { id: "baixo", crescimentoPct: 6, crescimentoTardioPct: 5, probabilidadePct: 25 },
  { id: "medio", crescimentoPct: 9, crescimentoTardioPct: 7, probabilidadePct: 50 },
  { id: "alto", crescimentoPct: 15, crescimentoTardioPct: 9, probabilidadePct: 25 },
];
