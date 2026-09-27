import { timingSafeEqual } from "node:crypto";
import { correrRetencao } from "@/lib/services/retencao-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A mesma verificação do cron das cotações: comparação em tempo constante. */
function bearerMatches(header: string | null, secret: string): boolean {
  const esperado = Buffer.from(`Bearer ${secret}`);
  const recebido = Buffer.from(header ?? "");
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/**
 * A passagem diária da retenção: avisar, congelar, descongelar.
 *
 * A decisão por ambiente vive em `domain/retencao.ts`; a execução em
 * `services/retencao-service.ts`. Aqui só se guarda a porta e se devolve o
 * relatório — que é o que permite, daqui a seis meses, responder "porque é que
 * este ambiente congelou naquele dia?" com os registos da Vercel em vez de
 * conjeturas.
 *
 * **Nada aqui apaga dados.** Congelar é reversível por definição: basta a
 * pessoa entrar, ou carregar em «Reativar».
 */
export async function GET(req: Request) {
  // Falha fechada, como o cron das cotações: sem `CRON_SECRET` não se entra.
  // Esta rota bloqueia o acesso de pessoas aos seus ambientes; aberta a quem
  // passasse, seria um botão público de "congela lá isso outra vez".
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron não configurado.", { status: 503 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const relatorio = await correrRetencao();
  return Response.json(relatorio);
}
