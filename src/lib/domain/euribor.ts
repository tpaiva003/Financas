/**
 * A Euribor, lida do Banco Central Europeu.
 *
 * **De onde vem e porquê daí.** O dono da Euribor é o EMMI, que a publica com
 * licença e sem API aberta. O BCE republica as mesmas séries no seu Data
 * Portal, de graça, sem chave e sem limite prático — e é uma fonte oficial, o
 * que numa app que mostra a prestação de um crédito à habitação não é detalhe.
 * As alternativas eram raspar um site de agregação, que muda de HTML quando
 * lhe apetece, ou pedir à pessoa que a escreva à mão, que é o que já acontecia.
 *
 * **A média do MÊS, e não o valor do dia.** Os contratos de crédito à habitação
 * em Portugal revêem-se por uma média — quase sempre a média do mês anterior —
 * e não pelo fixing de um dia qualquer. Pôr aqui o valor de hoje daria um
 * número diferente do que o banco vai usar, parecido o suficiente para ninguém
 * reparar e diferente o suficiente para a prestação não bater certo.
 *
 * **A leitura é pura e testada, a rede fica no serviço.** É a mesma divisão das
 * cotações, e pela mesma razão: um formato que muda tem de se poder exercitar
 * sem rede.
 */

import type { Indexante } from "./credito";

/**
 * A série do BCE para cada prazo.
 *
 * A chave lê-se: mensal (`M`), zona euro (`U2`), em euros, taxa de juro (`RT`),
 * mercado monetário (`MM`), o instrumento, e `HSTA` para a média do período.
 */
export const SERIE_BCE: Record<Indexante, string> = {
  euribor3m: "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA",
  euribor6m: "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA",
  euribor12m: "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA",
};

export function urlDaSerie(indexante: Indexante, quantosMeses = 6): string {
  const serie = SERIE_BCE[indexante];
  return `https://data-api.ecb.europa.eu/service/data/FM/${serie}?lastNObservations=${quantosMeses}&format=jsondata&detail=dataonly`;
}

export interface ValorEuribor {
  /** "AAAA-MM", o mês a que a média diz respeito. */
  periodo: string;
  /** Taxa anual em percentagem, como se escreve num contrato: 2,142. */
  pct: number;
}

/**
 * Lê a resposta SDMX-JSON do BCE.
 *
 * **O formato é indireto de propósito e é aí que se erra.** Os valores vêm
 * indexados por posição (`"0"`, `"1"`, …) e os períodos vêm numa lista à parte,
 * na mesma ordem. Casá-los pela ordem em que aparecem no objeto seria confiar
 * na ordem das chaves de um JSON; casam-se pelo índice, que é o que a posição
 * significa.
 *
 * Devolve vazio em vez de atirar. Uma resposta que mudou de forma não pode
 * deitar abaixo o formulário do crédito — o campo continua a poder ser escrito
 * à mão, que é como já funcionava.
 */
export function parseEuriborBCE(texto: string): ValorEuribor[] {
  let body: any;
  try {
    body = JSON.parse(texto);
  } catch {
    return [];
  }

  const series = body?.dataSets?.[0]?.series;
  if (!series || typeof series !== "object") return [];
  // Uma chave de série só, porque se pediu uma só.
  const primeira: any = Object.values(series)[0];
  const observacoes = primeira?.observations;
  if (!observacoes || typeof observacoes !== "object") return [];

  const periodos: any[] =
    body?.structure?.dimensions?.observation?.find((d: any) => d?.id === "TIME_PERIOD")?.values ??
    [];

  const out: ValorEuribor[] = [];
  for (const [indice, valor] of Object.entries(observacoes)) {
    const i = Number(indice);
    if (!Number.isInteger(i) || i < 0) continue;
    const bruto = Array.isArray(valor) ? valor[0] : null;
    /**
     * Só um número conta, e o `Number()` não serve aqui.
     *
     * `Number(null)` é `0` e `Number("")` também. O BCE marca uma observação
     * em falta com `null`, e essa conversão inocente transformava "este mês
     * não foi publicado" numa Euribor de **zero por cento** — que entrava num
     * plano de crédito e fazia uma prestação só de capital até 2055, com ar de
     * boa notícia.
     */
    if (typeof bruto !== "number" || !Number.isFinite(bruto)) continue;
    const pct = bruto;

    const periodo = periodos[i]?.id;
    if (typeof periodo !== "string") continue;
    out.push({ periodo, pct });
  }

  // Do mais antigo para o mais recente, que é como se lê uma série.
  return out.sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
}

/** A observação mais recente, ou `null` se não veio nenhuma. */
export function ultimaEuribor(valores: readonly ValorEuribor[]): ValorEuribor | null {
  return valores.length > 0 ? valores[valores.length - 1]! : null;
}

/**
 * Quão velho é este valor, em meses cheios.
 *
 * O BCE publica a média de um mês depois de ele acabar, por isso "o mês
 * passado" é o normal e não é motivo para aviso nenhum. Dois meses ou mais já
 * quer dizer que alguma coisa se atrasou — e uma taxa velha apresentada como
 * atual é o género de número em que ninguém repara.
 */
export function mesesDeAtraso(periodo: string, hoje: string): number {
  const [a1, m1] = periodo.split("-").map(Number);
  const [a2, m2] = hoje.split("-").map(Number);
  if (!a1 || !m1 || !a2 || !m2) return 0;
  return (a2 - a1) * 12 + (m2 - m1);
}

/** "2026-07" para "julho de 2026". */
export function periodoPorExtenso(periodo: string): string {
  const [ano, mes] = periodo.split("-").map(Number);
  if (!ano || !mes) return periodo;
  const nome = new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-PT", { month: "long" });
  return `${nome} de ${ano}`;
}
