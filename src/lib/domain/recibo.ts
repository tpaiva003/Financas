/**
 * A revisão determinística do que o modelo leu num recibo.
 *
 * **A divisão de trabalho é a mesma do contrato de crédito.** O modelo copia o
 * que está impresso; ESTE código decide o que disso é utilizável; a pessoa
 * confirma no formulário antes de qualquer gravação. Nada do que sai daqui
 * grava nada sozinho.
 *
 * **Porque é que a recusa de moeda estrangeira é inegociável.** A invariante
 * "sem taxa de câmbio não se grava preço nenhum" existe porque um valor noutra
 * moeda registado como euros é um número errado com ar de resposta. Um recibo
 * de umas férias em Londres não entra por aqui — regista-se à mão, sabendo-se
 * o que se está a converter.
 *
 * Lógica pura, sem acesso a dados nem a modelos.
 */

/** O que o modelo devolve depois de olhar para o recibo. Tudo por confirmar. */
export interface ReciboLido {
  /** Isto é mesmo um recibo/fatura/talão de compra? */
  encontrado: boolean;
  /** O total pago, em euros, tal como impresso. */
  totalEur: number | null;
  /** "EUR" quando o recibo está em euros; "outra" quando não está. */
  moeda: "EUR" | "outra" | null;
  /** "AAAA-MM-DD", só se estiver impressa. */
  data: string | null;
  /** O nome do comerciante, tal como impresso. */
  comerciante: string | null;
  notas: string;
}

export interface PropostaDeDespesa {
  amountCents: number;
  description: string;
  /** `null` = o recibo não deu data fiável; o formulário fica com a de hoje. */
  date: string | null;
  /** O que a pessoa deve olhar duas vezes antes de confirmar. */
  avisos: string[];
}

/** Acima disto não é um talão de supermercado, é um engano de leitura. */
const TECTO_CENTS = 10_000_000; // 100 000 €

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!DATA_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Transforma a leitura numa proposta de despesa, ou explica porque não dá.
 *
 * `hoje` vem de fora ("AAAA-MM-DD") para isto ser testável sem relógio.
 */
export function reviewRecibo(
  lida: ReciboLido,
  hoje: string,
): { proposta: PropostaDeDespesa | null; problema: string | null } {
  if (!lida.encontrado) {
    return { proposta: null, problema: lida.notas || "Isto não me parece um recibo." };
  }
  if (lida.moeda !== "EUR") {
    return {
      proposta: null,
      problema:
        "O recibo não está em euros. Sem taxa de câmbio não se grava preço nenhum — regista esta à mão, com o valor em euros do extrato.",
    };
  }
  const total = lida.totalEur;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
    return { proposta: null, problema: "Não consegui ler o total do recibo." };
  }
  // O clássico 4.2 * 100 = 419.999…: o arredondamento é obrigatório, não cosmético.
  const amountCents = Math.round(total * 100);
  if (amountCents > TECTO_CENTS) {
    return {
      proposta: null,
      problema: "O total lido é grande de mais para um recibo. Confirma o valor à mão.",
    };
  }

  const avisos: string[] = [];
  let date: string | null = null;
  if (lida.data && dataValida(lida.data)) {
    if (lida.data > hoje) {
      avisos.push(`A data lida (${lida.data}) é no futuro — ficou a de hoje.`);
    } else {
      date = lida.data;
      const anos = Number(hoje.slice(0, 4)) - Number(lida.data.slice(0, 4));
      if (anos >= 2) avisos.push(`A data lida (${lida.data}) já tem uns anos. Confirma-a.`);
    }
  } else if (lida.data) {
    avisos.push("A data do recibo não se percebeu — ficou a de hoje.");
  }

  const description = (lida.comerciante ?? "").trim().slice(0, 80) || "Recibo";
  return { proposta: { amountCents, description, date, avisos }, problema: null };
}
