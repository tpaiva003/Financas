/**
 * A passagem diária da retenção: avisar, congelar, descongelar.
 *
 * A decisão de cada ambiente é do `domain/retencao.ts`, que é puro e está
 * testado. Aqui só se lê o estado, se pergunta o que fazer, e se faz.
 *
 * **O que este serviço não faz, e é o mais importante:** não apaga nada. Não há
 * um único caminho neste ficheiro que remova uma linha de dados de ninguém. Foi
 * uma decisão explícita, contra a leitura habitual de "retenção a 90 dias" —
 * entre um sistema que apaga certo e um que congela errado, o segundo
 * devolve-se.
 *
 * **O relatório é o produto.** Um cron que corre em silêncio e devolve "ok" não
 * se distingue de um cron que não fez nada: durante meses foi exactamente esse
 * o estado desta funcionalidade. Cada passagem devolve o que fez e a quem, e o
 * que falhou fica dito em vez de desaparecer num `catch`.
 */

import { getRepository } from "@/lib/data";
import { describeDaysLeft, retentionVerdict, type RetentionState } from "@/lib/domain";
import { sendRetentionWarning } from "@/lib/email/send";

export interface PassagemDeRetencao {
  /** Quantos ambientes foram avaliados. Os completos nem entram na lista. */
  avaliados: number;
  avisados: number;
  congelados: number;
  descongelados: number;
  /** Avisos que não chegaram a sair, com o motivo. */
  avisosFalhados: { spaceId: string; motivo: string }[];
  /** O que rebentou, por ambiente. Um ambiente com erro não trava os outros. */
  erros: { spaceId: string; motivo: string }[];
}

/**
 * Corre a retenção sobre todos os ambientes gratuitos.
 *
 * `hoje` entra por parâmetro para o teste poder viajar no tempo sem mexer no
 * relógio do processo — e para não haver um `new Date()` escondido no meio de
 * uma decisão que bloqueia o acesso de alguém aos seus dados.
 */
export async function correrRetencao(hoje = new Date()): Promise<PassagemDeRetencao> {
  const repo = getRepository();
  const dia = hoje.toISOString().slice(0, 10);
  const agora = hoje.toISOString();

  const out: PassagemDeRetencao = {
    avaliados: 0,
    avisados: 0,
    congelados: 0,
    descongelados: 0,
    avisosFalhados: [],
    erros: [],
  };

  const ambientes = await repo.listSpacesForRetention();
  out.avaliados = ambientes.length;

  for (const a of ambientes) {
    try {
      const veredito = retentionVerdict({
        plan: a.plan,
        lastActivity: a.lastActivityAt,
        createdAt: a.createdAt,
        warnedAt: a.retentionWarnedAt,
        frozenAt: a.frozenAt,
        today: dia,
      });

      const estado: RetentionState = veredito.state;

      if (estado === "avisar") {
        // A marca fica **antes** do envio, de propósito. Se o email falhar e a
        // marca ficasse por pôr, a passagem seguinte tentava outra vez, e um
        // Resend com problemas dava à mesma pessoa um aviso por dia até se
        // resolver. Um aviso que não chega adia o congelamento; uma enxurrada
        // de avisos gasta a confiança de quem os recebe.
        await repo.markRetentionWarned(a.id, agora);
        out.avisados += 1;

        const quando = describeDaysLeft(veredito.daysLeft);
        for (const email of a.emails) {
          const r = await sendRetentionWarning(email, a.name, quando);
          if (!r.sent) {
            out.avisosFalhados.push({ spaceId: a.id, motivo: r.reason ?? "desconhecido" });
          }
        }
        continue;
      }

      if (estado === "congelar") {
        await repo.setSpaceFrozen(a.id, agora);
        out.congelados += 1;
        continue;
      }

      if (estado === "descongelar") {
        await repo.setSpaceFrozen(a.id, null);
        out.descongelados += 1;
        continue;
      }

      // "ativo" e "congelado" não pedem nada a ninguém.
    } catch (e) {
      // Um ambiente que rebenta não pode levar os outros atrás. O erro fica no
      // relatório: engoli-lo em silêncio era voltar ao problema que este
      // serviço existe para resolver.
      out.erros.push({
        spaceId: a.id,
        motivo: e instanceof Error ? e.message : "desconhecido",
      });
    }
  }

  return out;
}
