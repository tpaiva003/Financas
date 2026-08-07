/**
 * Quanto tempo se guardam os dados de quem experimentou e foi embora.
 *
 * Abrir o registo cria uma obrigação que não existia: passamos a guardar dados
 * financeiros de pessoas que os deixaram lá e nunca mais voltaram. Guardar para
 * sempre não é neutro — é acumular risco sobre informação que ninguém pediu para
 * manter, e é exactamente o que o RGPD diz para não fazer.
 *
 * Noventa dias sem atividade nenhuma, e o ambiente gratuito é apagado.
 *
 * **Isto apaga dados de pessoas a sério, por isso as regras são apertadas:**
 *
 * 1. **Nunca toca em ambientes `full`.** Quem foi convidado, quem paga, os donos
 *    da casa: ficam fora disto, sem excepção e sem depender de mais nenhuma
 *    condição.
 * 2. **Avisa-se antes, com margem.** Duas semanas de antecedência, por email. Um
 *    apagamento silencioso é indistinguível de perder os dados de alguém por
 *    acidente, e ninguém consegue provar a diferença depois.
 * 3. **Qualquer atividade reinicia a contagem.** Entrar já conta: se a pessoa
 *    voltou, não está abandonado.
 * 4. **O aviso caduca.** Se alguém foi avisado e depois voltou, o aviso não fica
 *    pendurado à espera — a contagem recomeça do zero, e um novo aviso terá de
 *    ser enviado antes de se apagar seja o que for.
 *
 * Lógica pura, sem acesso a dados. É deliberado: o que decide apagar dados de
 * alguém tem de ser legível e testável sem base de dados nenhuma à frente.
 */

import type { SpacePlan } from "./limits";

/** Dias sem atividade até um ambiente gratuito ser apagado. */
export const RETENTION_DAYS = 90;
/** Quantos dias antes se avisa. Duas semanas dá tempo a exportar ou a voltar. */
export const WARN_BEFORE_DAYS = 14;

export type RetentionState =
  /** Dentro do prazo, não se faz nada. */
  | "ativo"
  /** Está perto do fim e ainda não foi avisado: enviar aviso. */
  | "avisar"
  /** Passou o prazo e foi avisado com antecedência: pode apagar-se. */
  | "apagar"
  /** Passou o prazo mas nunca foi avisado: avisa-se primeiro. */
  | "avisar-primeiro";

export interface RetentionInput {
  plan: SpacePlan | undefined;
  /** Data da última atividade ("AAAA-MM-DD"). `null` = nunca houve. */
  lastActivity: string | null;
  /** Quando o ambiente foi criado, que serve de contagem se nunca houve atividade. */
  createdAt: string;
  /** Quando se avisou, se se avisou. */
  warnedAt: string | null;
  /** Hoje ("AAAA-MM-DD"). */
  today: string;
}

export interface RetentionVerdict {
  state: RetentionState;
  daysInactive: number;
  /** Dias até ao apagamento. Negativo quando já passou. */
  daysLeft: number;
}

function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * O que fazer a este ambiente hoje.
 *
 * A ordem das perguntas não é arbitrária: **o plano vem primeiro**, antes de
 * qualquer conta de datas. Um ambiente `full` nunca chega a ser avaliado, o que
 * torna impossível apagá-lo por um erro na aritmética das datas.
 */
export function retentionVerdict(input: RetentionInput): RetentionVerdict {
  const { plan, lastActivity, createdAt, warnedAt, today } = input;

  // Sem excepções e sem depender de mais nada: quem tem plano completo fica fora.
  if ((plan ?? "free") === "full") {
    return { state: "ativo", daysInactive: 0, daysLeft: RETENTION_DAYS };
  }

  // Um ambiente sem atividade nenhuma conta desde que foi criado. Sem isto, um
  // ambiente criado e abandonado no mesmo dia ficaria para sempre.
  const desde = lastActivity ?? createdAt;
  const daysInactive = Math.max(0, diasEntre(desde, today));
  const daysLeft = RETENTION_DAYS - daysInactive;

  // Um aviso enviado antes da última atividade já não vale: a pessoa voltou, a
  // contagem recomeçou, e apagar com base num aviso velho seria apagar sem aviso.
  const avisoValido = Boolean(warnedAt && warnedAt.slice(0, 10) >= desde.slice(0, 10));

  if (daysInactive >= RETENTION_DAYS) {
    // Passou o prazo, mas se ninguém avisou não se apaga: avisa-se agora e
    // espera-se a margem. Ninguém perde dados por não ter sido avisado.
    return {
      state: avisoValido ? "apagar" : "avisar-primeiro",
      daysInactive,
      daysLeft,
    };
  }

  if (daysLeft <= WARN_BEFORE_DAYS && !avisoValido) {
    return { state: "avisar", daysInactive, daysLeft };
  }

  return { state: "ativo", daysInactive, daysLeft };
}

/**
 * Quantos dias faltam, em português corrente, para o email e para o ecrã.
 */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft <= 0) return "hoje";
  if (daysLeft === 1) return "amanhã";
  return `daqui a ${daysLeft} dias`;
}
