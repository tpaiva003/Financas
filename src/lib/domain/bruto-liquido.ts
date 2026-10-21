/**
 * Do bruto ao líquido, para quem só tem o recibo à frente.
 *
 * **O que fica gravado continua a ser o líquido.** É o que se pode gastar, e é
 * sobre isso que a taxa de poupança faz sentido — a razão original de o
 * formulário pedir o líquido não mudou. Isto é uma calculadora que ajuda a
 * chegar lá, não um segundo valor a guardar ao lado.
 *
 * **A taxa de IRS vem de fora e o ecrã diz de onde.** As tabelas de retenção
 * mudam todos os anos e dependem de estado civil, número de titulares e
 * dependentes; escrevê-las de memória produzia números com o tamanho certo e o
 * valor errado, que é o modo de falha nº 5 desta app — "um número errado com ar
 * de resposta é pior do que erro nenhum". Por agora a taxa é a que vem escrita
 * no recibo de vencimento, que quem está a preencher tem à frente.
 *
 * **Onde entram as tabelas, quando entrarem.** `OrigemDaTaxa` já distingue os
 * dois casos e `liquidoDoBruto` não sabe nem quer saber de onde a taxa veio —
 * quem a calcular por tabela passa-a por aqui na mesma, com `origem: "tabela"`,
 * e o resto do cálculo não muda. Não há aqui nenhuma função a fingir que já
 * sabe: enquanto não houver uma fonte oficial verificada, não existe.
 *
 * Lógica pura, sem acesso a dados.
 */

/**
 * A contribuição do trabalhador por conta de outrem para a Segurança Social.
 *
 * Ao contrário do IRS, esta é uma percentagem única e estável há muitos anos, e
 * não depende de agregado nem de dependentes. É por isso que esta a app calcula
 * e a do IRS não.
 */
export const TAXA_SEGURANCA_SOCIAL_PCT = 11;

/** De onde veio a taxa de IRS usada. O ecrã tem de o poder dizer. */
export type OrigemDaTaxa = "recibo" | "tabela";

export interface DeducaoInput {
  brutoCents: number;
  /** Taxa de retenção de IRS em percentagem, como vem no recibo. */
  irsPct: number | null;
  /** A de Segurança Social, se não for a normal. */
  ssPct?: number;
  origem?: OrigemDaTaxa;
}

export interface Deducao {
  brutoCents: number;
  ssCents: number;
  irsCents: number;
  liquidoCents: number;
  origem: OrigemDaTaxa;
}

function pctValida(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * O líquido a partir do bruto, ou `null`.
 *
 * **Sem taxa de IRS não devolve nada.** Descontar só a Segurança Social daria um
 * "líquido" maior do que o real — e um número grande de mais no sítio do
 * ordenado é o pior sítio para um engano, porque alimenta a taxa de poupança, o
 * FIRE e tudo o que vem a seguir. É a mesma recusa do "sem taxa de câmbio não se
 * grava preço nenhum".
 *
 * As duas percentagens aplicam-se **ambas ao bruto**, que é como o recibo as
 * apresenta — e não em cascata, que daria um líquido diferente e mais alto.
 */
export function liquidoDoBruto(input: DeducaoInput): Deducao | null {
  const { brutoCents } = input;
  if (!Number.isFinite(brutoCents) || brutoCents <= 0) return null;
  if (!pctValida(input.irsPct)) return null;

  const ssPct = pctValida(input.ssPct) ? input.ssPct : TAXA_SEGURANCA_SOCIAL_PCT;
  if (input.irsPct + ssPct > 100) return null;

  const ssCents = Math.round((brutoCents * ssPct) / 100);
  const irsCents = Math.round((brutoCents * input.irsPct) / 100);

  return {
    brutoCents,
    ssCents,
    irsCents,
    liquidoCents: brutoCents - ssCents - irsCents,
    origem: input.origem ?? "recibo",
  };
}

/** "A taxa que escreveste, do teu recibo." — para o ecrã dizer a origem. */
export function origemPorExtenso(origem: OrigemDaTaxa): string {
  return origem === "recibo"
    ? "A taxa é a que escreveste, do teu recibo de vencimento."
    : "A taxa saiu das tabelas de retenção do ano.";
}
