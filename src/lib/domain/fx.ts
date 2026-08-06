/**
 * Câmbio.
 *
 * Uma compra de ETFs sai muitas vezes em dólares, e a conta em euros é o que
 * saiu mesmo da conta bancária. Duas decisões:
 *
 * 1. **O valor guardado é sempre em euros.** É a única base sã para somar
 *    património, calcular rentabilidade e comparar com um índice. A moeda
 *    original e a taxa ficam guardadas ao lado, para o registo se poder
 *    conferir mais tarde sem refazer contas.
 * 2. **A taxa pode ser a de referência ou a que a corretora aplicou.** Não é o
 *    mesmo número: a corretora cobra spread, e a taxa de referência do BCE é
 *    uma fixação diária que ninguém consegue na prática. Quem tem a nota de
 *    execução à frente sabe a taxa verdadeira, e essa ganha sempre à nossa.
 *
 * A taxa é sempre expressa em **unidades da moeda estrangeira por euro**, como
 * o BCE a publica: 1,09 quer dizer 1,09 USD por 1 EUR.
 *
 * Lógica pura, sem acesso a dados.
 */

export const FX_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BRL", "JPY", "CAD", "AUD"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];

export function isForeign(currency?: string | null): boolean {
  return Boolean(currency) && currency !== "EUR";
}

/** Converte para euros. `rate` = unidades da moeda estrangeira por euro. */
export function toEurCents(originalCents: number, rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(originalCents / rate);
}

/** O caminho inverso, para mostrar quanto foi na moeda de origem. */
export function fromEurCents(eurCents: number, rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(eurCents * rate);
}

/**
 * A taxa que uma operação implica, quando se sabem os dois valores.
 *
 * Serve para quem tem a nota da corretora com o valor em dólares e o débito em
 * euros e não tem a taxa escrita: ela sai da divisão dos dois.
 */
export function impliedRate(originalCents: number, eurCents: number): number | null {
  if (eurCents <= 0 || originalCents <= 0) return null;
  return originalCents / eurCents;
}

export function formatRate(rate: number): string {
  return rate.toFixed(4).replace(".", ",");
}

/**
 * Um valor na moeda em que ele é cotado, para se poder conferir.
 *
 * A app calcula tudo em euros, e é assim que tem de ser: é a única base sã para
 * somar património e comparar com um índice. Mas **ninguém confere uma ação
 * americana em euros**. Quem tem a AAPL vai ao telemóvel, vê 270 dólares, e
 * quer reconhecer esse número aqui — não uma conversão que já leva o câmbio
 * pelo meio e que não bate com nada do que vê em mais lado nenhum.
 *
 * Por isso o euro manda no cálculo e a moeda de origem aparece ao lado, mais
 * pequena: uma é a verdade da carteira, a outra é a que se reconhece.
 *
 * O código de três letras em vez do símbolo é de propósito: `$` é ambíguo entre
 * meia dúzia de moedas, e num sítio onde se somam valores isso não pode ficar
 * ao critério de quem lê.
 */
export function formatForeignCents(cents: number, currency: string): string {
  const valor = (cents / 100).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${valor} ${currency.toUpperCase()}`;
}
