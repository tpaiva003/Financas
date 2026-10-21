/**
 * Quando o dinheiro partilhado entra em vez de sair.
 *
 * **A aritmética já estava certa, o vocabulário é que não.** Um montante
 * negativo sempre foi aceite — é assim que os estornos das importações
 * funcionam — e o saldo nunca olhou ao sinal: quem "pagou" −100 recebeu 100, e
 * a quota de cada um sai com o mesmo sinal, pela mesma regra de divisão. Com
 * uma percentagem de 70/30, quem recebeu 100 fica a dever 30 a quem não
 * recebeu, que é exatamente o que se quer de um rendimento da casa.
 *
 * O que faltava era a app **dizer** isso. Em todo o lado se lia "despesa",
 * "quem pagou" e "−50,00 €" — um rendimento a dividir aparecia com ar de gralha
 * de quem se enganou no sinal, e quem o registou ficava sem saber se a app
 * tinha percebido.
 *
 * Aqui ficam as palavras que mudam com o sinal, num sítio só: o mesmo dinheiro
 * chamar-se rendimento num ecrã e despesa no seguinte é como não o ter dito.
 *
 * **Isto não é a página dos Rendimentos.** Essa guarda o que entra para cada
 * pessoa (salário, juros, rendas) e serve a taxa de poupança; não se reparte
 * nem mexe no saldo. Um rendimento partilhado é o contrário: entra para a casa
 * e divide-se como uma despesa.
 *
 * Lógica pura, sem acesso a dados.
 */

/**
 * Dinheiro que entra.
 *
 * Zero não é entrada nenhuma — e um montante zero nem sequer se grava, que o
 * formulário recusa.
 */
export function ehEntrada(amountCents: number): boolean {
  return amountCents < 0;
}

export interface PalavrasDoMontante {
  /** Para etiquetas e títulos: "Rendimento" ou "Despesa". */
  substantivo: string;
  /** Quem moveu o dinheiro: recebeu-o, ou pagou-o. */
  quemMoveu: string;
  /** O texto do botão que grava. */
  guardar: string;
  /**
   * O que cada um faz à sua parte, quando há palavra para isso.
   *
   * `null` numa despesa, e de propósito: a quota-parte é o que cada um
   * **suporta**, e escrever ali "paga" contradizia a regra mais antiga desta
   * app — quem pagou é independente de como se divide.
   */
  verboDaQuota: string | null;
}

const SAIDA: PalavrasDoMontante = {
  substantivo: "Despesa",
  quemMoveu: "Quem pagou",
  guardar: "Guardar despesa",
  verboDaQuota: null,
};

const ENTRADA: PalavrasDoMontante = {
  substantivo: "Rendimento",
  quemMoveu: "Quem recebeu",
  guardar: "Guardar rendimento",
  verboDaQuota: "recebe",
};

export function palavrasDoMontante(amountCents: number): PalavrasDoMontante {
  return ehEntrada(amountCents) ? ENTRADA : SAIDA;
}
