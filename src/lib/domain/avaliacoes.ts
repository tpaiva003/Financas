/**
 * O funil de avaliação: onde é que cada empresa está.
 *
 * **Um DCF sozinho não decide nada.** O que decide é o que se faz a seguir, e
 * é aí que uma folha de cálculo falha: o estudo fica num ficheiro, a decisão
 * fica na cabeça, e três meses depois já ninguém sabe se aquela empresa foi
 * descartada por caro, por má, ou se só ficou por rever. As etapas existem para
 * essa resposta ficar escrita.
 *
 * **Um estudo é um registo datado, não um valor vivo.** Guarda-se com os
 * pressupostos que o produziram e nunca se recalcula sozinho — se a fórmula
 * mudar, um valor que já serviu de base a uma decisão não pode mudar de opinião
 * retroactivamente. Reavaliar cria um estudo novo, e o antigo fica lá com a data
 * em que foi feito.
 *
 * **Um estudo de há um ano não vale o de ontem, e isso tem de se ver.** Os
 * pressupostos de um DCF envelhecem depressa: uma apresentação de resultados
 * chega para invalidar o fluxo de caixa que serviu de base a tudo. Por isso um
 * estudo tem idade visível e o mais antigo do mesmo símbolo aparece marcado como
 * substituído — em vez de dois cartões da mesma empresa com números diferentes e
 * nada a dizer qual é o que conta.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { CenarioDcf, CenarioId } from "./dcf-cenarios";

export type EtapaAvaliacao = "radar" | "estudo" | "esperar" | "comprada" | "arquivada";

export const ETAPAS: readonly EtapaAvaliacao[] = [
  "radar",
  "estudo",
  "esperar",
  "comprada",
  "arquivada",
] as const;

export const ETAPA_LABEL: Record<EtapaAvaliacao, string> = {
  radar: "Em radar",
  estudo: "Em estudo",
  esperar: "À espera de preço",
  comprada: "Comprada",
  arquivada: "Arquivada",
};

export const ETAPA_EXPLICACAO: Record<EtapaAvaliacao, string> = {
  radar: "Reparaste nela e ainda não a estudaste.",
  estudo: "Estás a lê-la. Ainda não há veredicto.",
  esperar: "A empresa serve, o preço não. Fica à espera de chegar ao teu.",
  comprada: "Já está na carteira.",
  arquivada: "Descartada. Fica o registo de porquê.",
};

export function etapaValida(v: string): v is EtapaAvaliacao {
  return (ETAPAS as readonly string[]).includes(v);
}

/**
 * A etapa a que um veredicto naturalmente leva.
 *
 * **Sugere, não decide.** Um DCF diz se o preço serve aos pressupostos que
 * alguém escreveu — não se a empresa se compra. Quem grava muda a etapa se
 * quiser; isto só evita que o caso mais comum precise de dois cliques.
 */
export function etapaSugerida(atrativo: boolean | null): EtapaAvaliacao {
  if (atrativo === null) return "estudo";
  return atrativo ? "esperar" : "arquivada";
}

/** Um estudo guardado, como o funil precisa de o ler. */
export interface AvaliacaoResumo {
  id: string;
  simbolo: string | null;
  nome: string;
  etapa: EtapaAvaliacao;
  /** "AAAA-MM-DD" do dia em que foi feito. */
  data: string;
  /** O preço ponderado a que se estava disposto a comprar, em cêntimos. */
  precoPonderadoCents: number;
  /** O preço de mercado no dia do estudo. */
  precoNaAlturaCents: number | null;
  upsidePct: number | null;
  notas: string | null;
}

export interface AvaliacaoNoFunil extends AvaliacaoResumo {
  /** Há um estudo mais recente da mesma empresa. */
  substituida: boolean;
  /** Quantos dias tem. */
  idadeDias: number;
  /**
   * Os pressupostos já têm idade que chegue para não se confiar neles.
   *
   * Seis meses são dois trimestres: o fluxo de caixa que serviu de base ao
   * estudo já foi substituído duas vezes por outro que ninguém pôs aqui.
   */
  envelhecida: boolean;
}

/** Meio ano. Ver `envelhecida`. */
const DIAS_ATE_ENVELHECER = 182;

function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Marca cada estudo com a sua idade e diz qual foi substituído.
 *
 * Dois estudos da mesma empresa com valores diferentes e nada a dizer qual é o
 * que conta são piores do que um estudo só: quem olha escolhe o número que lhe
 * agrada, sem saber que está a escolher.
 *
 * A comparação é pelo **símbolo** quando o há, e pelo nome quando não há. Sem o
 * segundo caso, duas avaliações de uma empresa sem ticker nunca se veriam uma à
 * outra — e é precisamente aí (imobiliário, empresas fechadas) que a data é a
 * única coisa que as distingue.
 */
export function montarFunil(
  avaliacoes: readonly AvaliacaoResumo[],
  hoje: string,
): AvaliacaoNoFunil[] {
  const chave = (a: AvaliacaoResumo) =>
    a.simbolo ? `s:${a.simbolo.toLowerCase()}` : `n:${a.nome.trim().toLowerCase()}`;

  // A mais recente de cada empresa. Com datas iguais fica a primeira da lista,
  // que vem ordenada da mais recente para a mais antiga.
  const maisRecente = new Map<string, string>();
  const ordenadas = [...avaliacoes].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  for (const a of ordenadas) {
    const k = chave(a);
    if (!maisRecente.has(k)) maisRecente.set(k, a.id);
  }

  return ordenadas.map((a) => {
    const idadeDias = diasEntre(a.data, hoje);
    return {
      ...a,
      substituida: maisRecente.get(chave(a)) !== a.id,
      idadeDias,
      // Uma avaliação substituída já não se cobra de idade: o que interessa
      // dela é que foi substituída, e duas marcas no mesmo cartão não dizem
      // mais do que uma.
      envelhecida: maisRecente.get(chave(a)) === a.id && idadeDias > DIAS_ATE_ENVELHECER,
    };
  });
}

/** Quantas em cada etapa, na ordem do funil. */
export function contarPorEtapa(funil: readonly AvaliacaoNoFunil[]): Record<EtapaAvaliacao, number> {
  const c = { radar: 0, estudo: 0, esperar: 0, comprada: 0, arquivada: 0 };
  for (const a of funil) c[a.etapa] += 1;
  return c;
}

/**
 * Quanto é que o preço tem de descer para o estudo passar a fazer sentido.
 *
 * É a pergunta que se faz a uma empresa que ficou "à espera de preço", e é a
 * que a folha de cálculo nunca respondia sem se ir lá dentro fazer a conta.
 * Devolve `null` quando já lá está — nesse caso a pergunta não é essa.
 */
export function quantoFaltaDescer(a: AvaliacaoResumo): number | null {
  if (a.precoNaAlturaCents === null || a.precoNaAlturaCents <= 0) return null;
  if (a.precoPonderadoCents >= a.precoNaAlturaCents) return null;
  return Math.round(((a.precoNaAlturaCents - a.precoPonderadoCents) / a.precoNaAlturaCents) * 1000) / 10;
}

/**
 * Lê os cenários guardados em `jsonb`, campo a campo.
 *
 * **Um `as unknown as` não valida nada**, e esta app já pagou para o aprender:
 * dados guardados por versões antigas chegam incompletos, e `undefined >= 0` é
 * `false`, que se lê como "esta coluna não existe". Aqui a consequência seria
 * pior — um cenário sem probabilidade entrava na média pesada como zero e
 * desviava o preço ponderado sem nada no ecrã a dizê-lo.
 *
 * Devolve `null` quando o que está guardado não serve. Quem lê mostra o estudo
 * sem os cenários em vez de o mostrar com cenários errados.
 */
export function lerCenarios(bruto: unknown): CenarioDcf[] | null {
  if (!Array.isArray(bruto) || bruto.length === 0) return null;

  const ids: readonly CenarioId[] = ["baixo", "medio", "alto"];
  const lidos: CenarioDcf[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const id = o.id;
    if (typeof id !== "string" || !(ids as readonly string[]).includes(id)) return null;

    const n = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const crescimentoPct = n(o.crescimentoPct);
    const crescimentoTardioPct = n(o.crescimentoTardioPct);
    const probabilidadePct = n(o.probabilidadePct);
    if (crescimentoPct === null || crescimentoTardioPct === null || probabilidadePct === null) {
      return null;
    }
    lidos.push({
      id: id as CenarioId,
      crescimentoPct,
      crescimentoTardioPct,
      probabilidadePct,
    });
  }
  return lidos;
}
