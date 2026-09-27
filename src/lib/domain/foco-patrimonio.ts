/**
 * O foco do resumo: olhar para tudo, ou só para uma parte.
 *
 * **Porque é que isto existe.** O património de quem tem casa é quase todo
 * casa. Uma carteira de investimentos a subir 8% num ano desaparece no desenho
 * ao lado de um imóvel que vale cinco vezes mais e não se mexe — e a pergunta
 * "como está a correr a parte investida?" fica sem resposta num ecrã que tem os
 * dados todos para a dar.
 *
 * **Filtra o que se conta, não o que existe.** Escolher "Investimentos" não
 * apaga a casa nem a dívida: só os deixa de fora desta vista. O património
 * líquido a sério continua a ser o de "Tudo", e é por isso que esse é o foco por
 * omissão — abrir a app numa vista parcial faria alguém ler um total que não é
 * o seu.
 *
 * **As dívidas só entram no foco que as inclui.** Num foco de investimentos, o
 * crédito à habitação não tem nada que subtrair: subtraí-lo dava um "líquido"
 * negativo que não corresponde a decisão nenhuma. Ver `contaDividas`.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { AssetKind } from "./networth";
import type { NetWorthSnapshot } from "./networth-history";

export type FocoId = "tudo" | "investimento" | "imovel" | "liquidez";

export interface Foco {
  id: FocoId;
  label: string;
  /** Os tipos de bem que este foco conta. */
  kinds: readonly AssetKind[];
  /** Uma frase a dizer a que pergunta esta vista responde. */
  pergunta: string;
}

export const FOCOS: readonly Foco[] = [
  {
    id: "tudo",
    label: "Tudo",
    kinds: ["conta", "investimento", "imovel", "outro", "divida"],
    pergunta: "O que tens menos o que deves.",
  },
  {
    id: "investimento",
    label: "Investimentos",
    kinds: ["investimento"],
    pergunta: "Como está a correr a parte investida, sem o resto a esmagar o desenho.",
  },
  {
    id: "imovel",
    label: "Imóveis",
    kinds: ["imovel", "divida"],
    pergunta: "O que as casas valem, menos o que falta pagar delas.",
  },
  {
    id: "liquidez",
    label: "Liquidez",
    kinds: ["conta"],
    pergunta: "O dinheiro a que consegues chegar amanhã de manhã.",
  },
] as const;

export function focoValido(v: string | null | undefined): FocoId {
  const encontrado = FOCOS.find((f) => f.id === v);
  // Por omissão, tudo. Abrir a app numa vista parcial faria alguém ler um total
  // que não é o seu.
  return encontrado ? encontrado.id : "tudo";
}

export function focoDe(id: FocoId): Foco {
  return FOCOS.find((f) => f.id === id) ?? FOCOS[0]!;
}

/** Este tipo de bem entra nesta vista? */
export function contaNoFoco(kind: AssetKind, id: FocoId): boolean {
  return focoDe(id).kinds.includes(kind);
}

/**
 * As dívidas contam neste foco?
 *
 * Só em "Tudo" e em "Imóveis". Num foco de investimentos o crédito à habitação
 * não tem nada que subtrair, e subtraí-lo dava um "líquido" negativo que não
 * corresponde a decisão nenhuma.
 */
export function contaDividas(id: FocoId): boolean {
  return focoDe(id).kinds.includes("divida");
}

/**
 * O que dizer quando um foco não tem nada.
 *
 * Um ecrã vazio sem explicação lê-se como avaria. E a frase muda com o foco: em
 * "Imóveis" o que falta é registar uma casa; em "Tudo", é registar seja o que
 * for.
 */
export function focoVazioPorExtenso(id: FocoId): string {
  switch (id) {
    case "investimento":
      return "Não tens investimentos registados neste ambiente.";
    case "imovel":
      return "Não tens imóveis registados neste ambiente.";
    case "liquidez":
      return "Não tens contas nem depósitos registados neste ambiente.";
    default:
      return "Ainda não registaste nada no património deste ambiente.";
  }
}

/**
 * O histórico visto por um foco.
 *
 * **Um ponto que não sabe repartir-se é deitado fora, não estimado.** As
 * fotografias guardam o valor por tipo de bem num `jsonb` (`porTipo`), mas as
 * antigas — e todas as reconstruídas — só guardaram o total. Repartir esse
 * total pelas proporções de hoje desenharia uma linha de investimentos que
 * nunca existiu, com o ar de facto que uma linha desenhada tem. Por isso o
 * ponto desaparece e a série diz quantos ficaram de fora, para o ecrã poder
 * explicar o buraco em vez de o esconder.
 *
 * Em "Tudo" não há nada a repartir e passam todos, incluindo os reconstruídos.
 */
export function snapshotsDoFoco(
  snapshots: readonly NetWorthSnapshot[],
  id: FocoId,
): { snapshots: NetWorthSnapshot[]; semReparticao: number } {
  if (id === "tudo") return { snapshots: [...snapshots], semReparticao: 0 };

  const foco = focoDe(id);
  const bens = foco.kinds.filter((k) => k !== "divida");
  const out: NetWorthSnapshot[] = [];
  let semReparticao = 0;

  for (const s of snapshots) {
    if (!s.porTipo) {
      semReparticao += 1;
      continue;
    }
    const assetsCents = bens.reduce((total, k) => total + (s.porTipo![k] ?? 0), 0);
    const debtsCents = contaDividas(id) ? (s.porTipo.divida ?? 0) : 0;
    out.push({
      ...s,
      assetsCents,
      debtsCents,
      netCents: assetsCents - debtsCents,
    });
  }

  return { snapshots: out, semReparticao };
}
