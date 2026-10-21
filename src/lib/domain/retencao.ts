/**
 * Quanto tempo se guardam os dados de quem experimentou e foi embora.
 *
 * Abrir o registo cria uma obrigação que não existia: passamos a guardar dados
 * financeiros de pessoas que os deixaram lá e nunca mais voltaram. Guardar para
 * sempre não é neutro — é acumular risco sobre informação que ninguém pediu para
 * manter, e é exactamente o que o RGPD diz para não fazer.
 *
 * Noventa dias sem atividade nenhuma, e o ambiente gratuito **congela**: fica só
 * de leitura, deixa de contar para custos, e os dados ficam lá.
 *
 * **Não se apaga nada.** Foi uma decisão explícita, contra a leitura habitual de
 * "retenção a 90 dias" — que é guardar e depois eliminar. Congelar não cumpre a
 * minimização do RGPD tão bem como apagar, e isso fica dito; em troca, ninguém
 * perde dados financeiros por ter estado uns meses sem entrar, e um erro nesta
 * lógica é sempre reversível. Entre um sistema que apaga certo e um que congela
 * errado, o segundo devolve-se; o primeiro não.
 *
 * As regras:
 *
 * 1. **Nunca toca em ambientes `full`.** Quem foi convidado, quem paga, os donos
 *    da casa: ficam fora disto, sem excepção e sem depender de mais nenhuma
 *    condição.
 * 2. **Avisa-se antes, com margem.** Duas semanas por email. Chegar e encontrar
 *    tudo bloqueado sem aviso é mau, mesmo sendo reversível.
 * 3. **Qualquer atividade reinicia a contagem e descongela.** Entrar já conta: se
 *    a pessoa voltou, não está abandonado.
 * 4. **O aviso caduca.** Quem foi avisado e voltou não fica com um aviso pendurado
 *    à espera — a contagem recomeça do zero.
 * 5. **Já congelado não é para congelar outra vez.** Sem esta distinção, um cron
 *    diário decidia `congelar` todos os dias sobre o mesmo ambiente: reescrevia a
 *    data do congelamento, e a data deixava de dizer quando aconteceu. Passar a
 *    pagar também descongela — quem paga não fica com o ambiente bloqueado à
 *    espera de voltar a entrar.
 *
 * Lógica pura, sem acesso a dados. É deliberado: o que decide bloquear o acesso
 * de alguém aos seus dados tem de ser legível sem base de dados à frente.
 */

import type { SpacePlan } from "./limits";

/** Dias sem atividade até um ambiente gratuito congelar. */
export const RETENTION_DAYS = 90;
/** Quantos dias antes se avisa. Duas semanas dá tempo a voltar. */
export const WARN_BEFORE_DAYS = 14;

export type RetentionState =
  /** Dentro do prazo, não se faz nada. */
  | "ativo"
  /** Está perto do fim e ainda não foi avisado: enviar aviso. */
  | "avisar"
  /** Passou o prazo: passa a só de leitura. Os dados ficam. */
  | "congelar"
  /** Já está congelado e assim fica. Não se volta a congelar o que já congelou. */
  | "congelado"
  /** Está congelado mas voltou a haver vida: destrancar. */
  | "descongelar";

export interface RetentionInput {
  plan: SpacePlan | undefined;
  /** Data da última atividade ("AAAA-MM-DD"). `null` = nunca houve. */
  lastActivity: string | null;
  /** Quando o ambiente foi criado, que serve de contagem se nunca houve atividade. */
  createdAt: string;
  /** Quando se avisou, se se avisou. */
  warnedAt: string | null;
  /** Quando congelou, se está congelado. `null` = não está. */
  frozenAt: string | null;
  /** Hoje ("AAAA-MM-DD"). */
  today: string;
}

export interface RetentionVerdict {
  state: RetentionState;
  daysInactive: number;
  /** Dias até congelar. Negativo quando já passou. */
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
  const { plan, lastActivity, createdAt, warnedAt, frozenAt, today } = input;

  // Sem excepções e sem depender de mais nada: quem tem plano completo fica fora.
  if ((plan ?? "free") === "full") {
    // Com uma excepção que só existe a favor de quem paga: um ambiente que
    // estava congelado e passou a completo descongela. Ficar bloqueado depois
    // de pagar era o pior desfecho possível desta regra.
    if (frozenAt) return { state: "descongelar", daysInactive: 0, daysLeft: RETENTION_DAYS };
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

  if (frozenAt) {
    // Voltou a haver vida depois do congelamento: destranca. É a regra 3 a
    // funcionar sem obrigar a pessoa a pedir nada a ninguém.
    if (desde.slice(0, 10) > frozenAt.slice(0, 10)) {
      return { state: "descongelar", daysInactive, daysLeft };
    }
    // Já está congelado e continua parado: não se faz nada. Voltar a congelar
    // reescrevia a data e o `frozen_at` deixava de dizer quando aconteceu.
    return { state: "congelado", daysInactive, daysLeft };
  }

  if (daysInactive >= RETENTION_DAYS) {
    // Congela mesmo sem aviso válido. É a diferença que faz congelar em vez de
    // apagar: como é reversível — basta a pessoa voltar — não vale a pena
    // manter um ambiente abandonado a consumir recursos à espera de um email
    // que talvez nunca seja lido. O aviso continua a ser enviado antes.
    return { state: "congelar", daysInactive, daysLeft };
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
