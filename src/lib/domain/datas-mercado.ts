/**
 * As datas que valem um aviso, e quando é que valem.
 *
 * **Um aviso que aparece sempre deixa de ser um aviso.** Se a carteira mostrasse
 * a próxima apresentação de resultados de todas as posições o ano inteiro, ao
 * fim de uma semana ninguém lia aquela zona do ecrã — e no dia em que uma
 * interessasse, já estava invisível. Por isso só entram as que estão perto, e
 * "perto" é diferente conforme o que se pode fazer com a informação.
 *
 * **Resultados: catorze dias.** É o que dá para reler o estudo antes de a
 * empresa o invalidar. Avisar com dois meses não muda nada; avisar na véspera
 * chega tarde para rever seja o que for.
 *
 * **Data-ex: sete dias, e é a única com prazo a sério.** Quem quiser o dividendo
 * tem de ter as ações **antes** desse dia — passou, perdeu-se, e não há como
 * voltar atrás. É a única destas datas em que não agir tem consequência.
 *
 * **Pagamento: cinco dias, e só para se saber que vem dinheiro.** Não há nada a
 * decidir; serve para o dinheiro que aparece na conta não ser uma surpresa.
 *
 * **Uma data que passou há pouco também aparece.** Uma apresentação de
 * resultados de anteontem explica o salto na cotação que se está a olhar hoje —
 * e é precisamente aí que alguém pergunta "o que é que aconteceu a isto?".
 *
 * Lógica pura, sem acesso a dados.
 */

export type TipoDeData = "resultados" | "ex-dividendo" | "dividendo";

/** Quantos dias antes é que cada tipo passa a aparecer. Ver o cabeçalho. */
const AVISO_DIAS: Record<TipoDeData, number> = {
  resultados: 14,
  "ex-dividendo": 7,
  dividendo: 5,
};

/**
 * Quantos dias depois é que uma data ainda aparece.
 *
 * Três para todas: passado isso, o salto na cotação já foi absorvido e a
 * informação passa a ser história.
 */
const DEPOIS_DIAS = 3;

export const DATA_LABEL: Record<TipoDeData, string> = {
  resultados: "Resultados",
  "ex-dividendo": "Data-ex do dividendo",
  dividendo: "Pagamento do dividendo",
};

export const DATA_PORQUE: Record<TipoDeData, string> = {
  resultados: "Os números que saem daqui podem invalidar o estudo que tens.",
  "ex-dividendo": "Para receber o dividendo tens de ter as ações antes deste dia.",
  dividendo: "É quando o dinheiro entra na conta.",
};

/** Um investimento com as datas que a fonte deu. */
export interface InvestimentoComDatas {
  id: string;
  name: string;
  symbol?: string | null;
  /** Está em carteira? Uma posição fechada não tem datas a interessar. */
  emCarteira: boolean;
  nextEarningsDate?: string | null;
  exDividendDate?: string | null;
  dividendDate?: string | null;
}

export interface DataAProximar {
  assetId: string;
  nome: string;
  simbolo: string | null;
  tipo: TipoDeData;
  /** "AAAA-MM-DD". */
  data: string;
  /** Negativo quando já passou. */
  emDias: number;
}

function diasEntre(de: string, ate: string): number | null {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * As datas que valem a pena mostrar hoje, da mais próxima para a mais distante.
 *
 * **Só de posições em carteira.** Uma empresa que já se vendeu continua a
 * apresentar resultados, e isso não é assunto de ninguém que já não a tenha.
 */
export function datasAProximar(
  investimentos: readonly InvestimentoComDatas[],
  hoje: string,
): DataAProximar[] {
  const saida: DataAProximar[] = [];

  for (const inv of investimentos) {
    if (!inv.emCarteira) continue;

    const candidatas: [TipoDeData, string | null | undefined][] = [
      ["resultados", inv.nextEarningsDate],
      ["ex-dividendo", inv.exDividendDate],
      ["dividendo", inv.dividendDate],
    ];

    for (const [tipo, data] of candidatas) {
      if (!data) continue;
      const emDias = diasEntre(hoje, data);
      if (emDias === null) continue;
      if (emDias > AVISO_DIAS[tipo]) continue;
      if (emDias < -DEPOIS_DIAS) continue;
      saida.push({
        assetId: inv.id,
        nome: inv.name,
        simbolo: inv.symbol ?? null,
        tipo,
        data,
        emDias,
      });
    }
  }

  return saida.sort((a, b) => a.emDias - b.emDias || (a.nome < b.nome ? -1 : 1));
}

/**
 * "amanhã", "daqui a 3 dias", "anteontem".
 *
 * Em dias e não em datas porque é assim que a pergunta se faz: ninguém quer
 * saber se é dia 14, quer saber se ainda dá tempo.
 */
export function quandoPorExtenso(emDias: number): string {
  if (emDias === 0) return "hoje";
  if (emDias === 1) return "amanhã";
  if (emDias === -1) return "ontem";
  if (emDias === 2) return "depois de amanhã";
  if (emDias === -2) return "anteontem";
  return emDias > 0 ? `daqui a ${emDias} dias` : `há ${Math.abs(emDias)} dias`;
}

/** Quanto tempo uma consulta às datas serve antes de valer a pena repeti-la. */
const DIAS_ATE_REVER = 7;

/**
 * Vale a pena ir buscar as datas deste investimento?
 *
 * Uma semana: as datas de uma empresa mudam quatro vezes por ano, e ir buscá-las
 * a cada visita era gastar a fonte por nada. `null` quer dizer que nunca se foi.
 */
export function precisaDeDatas(consultadoEm: string | null | undefined, agora: Date): boolean {
  if (!consultadoEm) return true;
  const t = Date.parse(consultadoEm);
  if (Number.isNaN(t)) return true;
  return agora.getTime() - t > DIAS_ATE_REVER * 86_400_000;
}
