/**
 * Ler o ficheiro da corretora com ajuda de um modelo de linguagem.
 *
 * **Porquê.** A deteção por cabeçalhos conhece os nomes que alguém já viu.
 * Funciona bem no ficheiro para que foi afinada e falha no seguinte, porque cada
 * corretora escreve o que lhe apetece: "Produto" numa, "Instrument" noutra,
 * "Valor local" numa terceira, e colunas sem nome nenhum. Acrescentar sinónimos
 * à lista de cada vez que aparece um formato novo não escala: os utilizadores
 * trazem formatos que ninguém previu.
 *
 * **O que o modelo faz, e o que não faz.** Escolhe **colunas**, e mais nada. Diz
 * "a data é a coluna 1, a quantidade é a 7, e a compra/venda lê-se pelo sinal da
 * quantidade". Não lê valores, não converte moedas, não decide o que é duplicado.
 * Tudo isso continua no código determinístico e testado que já cá estava. Um
 * modelo a somar dinheiro é um erro à espera de acontecer; um modelo a dizer
 * "aquela coluna chama-se Preços mas é o preço unitário" é exactamente o que ele
 * faz bem.
 *
 * Isto também mantém os invariantes de pé: a deduplicação, o cálculo do saldo e
 * a conversão cambial nunca passam por aqui.
 *
 * **Privacidade.** Só sobem o cabeçalho e um punhado de linhas de exemplo, com
 * as células truncadas. Não sobe o ficheiro.
 *
 * Lógica pura, sem rede. Quem fala com o modelo é o serviço.
 */

import type { Grid } from "./columns";
import type { TradeMapping } from "./trades";
import type { HoldingMapping } from "./holdings";

/** Quantas linhas do ficheiro se mostram ao modelo. */
export const AI_SAMPLE_ROWS = 14;
/** Quantos caracteres de cada célula. Um nome de produto longo não ajuda mais. */
export const AI_MAX_CELL = 40;
/** Um tecto de colunas, para um ficheiro largo não fazer um pedido enorme. */
export const AI_MAX_COLS = 40;

/**
 * O que o modelo devolve.
 *
 * Só índices de colunas e um tipo. As colunas que o ficheiro não tiver vêm a
 * `null`, que é diferente de zero: zero é a primeira coluna.
 */
export interface AiMappingAnswer {
  tipo: "movimentos" | "posicoes" | "nenhum";
  linhaCabecalho: number;
  dataCol: number | null;
  nomeCol: number | null;
  quantidadeCol: number | null;
  precoCol: number | null;
  custoMedioCol: number | null;
  valorCol: number | null;
  moedaCol: number | null;
  taxaCambioCol: number | null;
  tipoOperacaoCol: number | null;
  /** O que o modelo percebeu, em português, para se mostrar a quem importa. */
  notas: string;
}

/**
 * As linhas que se mostram ao modelo.
 *
 * Poucas e curtas: o que distingue uma coluna de data de uma de valor vê-se em
 * três linhas, e mandar o ficheiro inteiro só custa dinheiro e expõe dados que
 * não precisam de sair daqui.
 */
export function sampleForModel(grid: Grid): string[][] {
  return grid.slice(0, AI_SAMPLE_ROWS).map((row) =>
    (row ?? []).slice(0, AI_MAX_COLS).map((cell) => {
      const s = (cell ?? "").toString().replace(/\s+/g, " ").trim();
      return s.length > AI_MAX_CELL ? `${s.slice(0, AI_MAX_CELL)}…` : s;
    }),
  );
}

/**
 * A amostra em texto, com as colunas numeradas.
 *
 * Numeradas porque é isso que se pede de volta: um índice, não um nome. Os nomes
 * repetem-se, vêm vazios, ou vêm em línguas diferentes no mesmo ficheiro.
 */
export function renderSample(sample: string[][]): string {
  const width = Math.max(0, ...sample.map((r) => r.length));
  const cabecalho = Array.from({ length: width }, (_, i) => `[${i}]`).join(" | ");
  const linhas = sample.map((row, i) => {
    const celulas = Array.from({ length: width }, (_, c) => row[c] ?? "");
    return `linha ${i}: ${celulas.join(" | ")}`;
  });
  return [`colunas: ${cabecalho}`, ...linhas].join("\n");
}

/** Um índice só serve se existir mesmo no ficheiro. */
function col(value: number | null | undefined, width: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return -1;
  if (value < 0 || value >= width) return -1;
  return value;
}

/** A largura da grelha, que é o que limita os índices aceitáveis. */
export function gridWidth(grid: Grid): number {
  return Math.max(0, ...grid.map((r) => (r ?? []).length));
}

/**
 * A resposta do modelo convertida num mapeamento de movimentos.
 *
 * Devolve `null` quando falta o essencial. **Nada do que o modelo diga entra sem
 * ser verificado**: um índice fora da grelha, uma linha de cabeçalho que não
 * existe, ou um tipo que não é o esperado, e a resposta é descartada. É mais
 * seguro voltar ao mapeamento à mão do que importar com as colunas trocadas.
 */
export function toTradeMapping(answer: AiMappingAnswer, grid: Grid): TradeMapping | null {
  if (answer.tipo !== "movimentos") return null;
  const width = gridWidth(grid);
  const headerRow = col(answer.linhaCabecalho, grid.length);
  if (headerRow === -1) return null;

  const dateCol = col(answer.dataCol, width);
  const nameCol = col(answer.nomeCol, width);
  const quantityCol = col(answer.quantidadeCol, width);
  // Sem estas três não há movimento nenhum: não se sabe quando, o quê, nem quanto.
  if (dateCol === -1 || nameCol === -1 || quantityCol === -1) return null;

  return {
    headerRow,
    dateCol,
    nameCol,
    quantityCol,
    priceCol: col(answer.precoCol, width),
    amountCol: col(answer.valorCol, width),
    currencyCol: col(answer.moedaCol, width),
    fxRateCol: col(answer.taxaCambioCol, width),
    kindCol: col(answer.tipoOperacaoCol, width),
  };
}

/** O mesmo para uma lista de posições, onde não há datas. */
export function toHoldingMapping(answer: AiMappingAnswer, grid: Grid): HoldingMapping | null {
  if (answer.tipo !== "posicoes") return null;
  const width = gridWidth(grid);
  const headerRow = col(answer.linhaCabecalho, grid.length);
  if (headerRow === -1) return null;

  const nameCol = col(answer.nomeCol, width);
  const quantityCol = col(answer.quantidadeCol, width);
  if (nameCol === -1 || quantityCol === -1) return null;

  return {
    headerRow,
    nameCol,
    quantityCol,
    unitCostCol: col(answer.custoMedioCol, width),
    unitPriceCol: col(answer.precoCol, width),
    marketValueCol: col(answer.valorCol, width),
  };
}
