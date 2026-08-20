import { timingSafeEqual } from "node:crypto";
import { getRepository } from "@/lib/data";
import { BENCHMARKS, symbolCandidates } from "@/lib/domain";
import { getQuoteSeries, refreshStalePrices } from "@/lib/services/quotes-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * O cabeçalho corresponde ao segredo, sem deixar o tempo de resposta contar
 * quantos caracteres acertaram. Compara-se sempre o mesmo número de bytes: o
 * `timingSafeEqual` rebenta com comprimentos diferentes, por isso o tamanho é
 * verificado antes e em separado.
 */
function bearerMatches(header: string | null, secret: string): boolean {
  const esperado = Buffer.from(`Bearer ${secret}`);
  const recebido = Buffer.from(header ?? "");
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/**
 * Atualização diária das cotações.
 *
 * Sem isto, o preço só se renovava quando alguém abria a página de Ativos, e a
 * primeira visita do dia pagava a espera. Pior: quem entra de manhã via o fecho
 * de anteontem até a página ir buscar o de ontem.
 *
 * Corre uma vez por dia, depois do fecho americano, e enche a cache de todos os
 * símbolos conhecidos: os dos índices e os que as pessoas registaram. Como as
 * cotações são partilhadas por todos os ambientes, uma passagem serve toda a
 * gente, e a partir daí as páginas desenham-se sem esperar por ninguém.
 *
 * **E fecha o ciclo: escreve o preço em cada investimento.** Era a visita à
 * página que escrevia, e isso punha fetches de câmbio e uma escrita por ativo
 * no meio de um GET, com o utilizador à espera. Agora a página só lê
 * (`lerFrescura`); quem põe os `unit_price_cents` em dia é isto — à noite
 * depois do fecho americano e de manhã antes de alguém entrar — e o botão
 * «Atualizar preços» para quem não quer esperar.
 */
export async function GET(req: Request) {
  // A Vercel assina os pedidos do cron. Sem isto, era um endereço público a
  // fazer dezenas de chamadas externas por conta de quem lhe batesse à porta.
  // Falha fechada. Antes era `if (secret && ...)`: sem `CRON_SECRET` definido a
  // guarda não corria de todo, e o `.env.example` traz o segredo vazio — ou
  // seja, a configuração por omissão deixava isto aberto a qualquer pessoa,
  // com dezenas de chamadas externas por pedido. Sem segredo não se entra.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron não configurado.", { status: 503 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const repo = getRepository();
  const registados = await repo.listAllAssetSymbols().catch(() => []);
  const symbols = [
    ...new Set([
      ...BENCHMARKS.flatMap((b) => b.symbols.map((s) => s.symbol)),
      ...registados.flatMap((r) => symbolCandidates(r)),
    ]),
  ].slice(0, 40);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const series = await getQuoteSeries(symbol, { force: true }).catch(() => null);
      return {
        symbol,
        ok: Boolean(series && series.quotes.length > 0),
        lastDate: series?.lastDate ?? null,
      };
    }),
  );

  const ok = results.filter((r) => r.ok).length;

  // Com a cache cheia, escrever os preços é o caminho rápido do
  // refreshStalePrices (sem force): quase tudo sai do atalho "já há fecho
  // fresco guardado", e o que precisar de rede gasta o tecto normal. Um
  // ambiente a falhar não pode impedir os outros.
  const espacos = await repo.listSpacesComInvestimentos().catch(() => []);
  const escritas = await Promise.all(
    espacos.map(async (spaceId) => {
      const frescura = await refreshStalePrices(spaceId).catch(() => []);
      return { spaceId, escritos: frescura.filter((f) => f.refreshed).length };
    }),
  );

  return Response.json({
    atualizados: ok,
    falhados: results.length - ok,
    ambientes: escritas.length,
    precosEscritos: escritas.reduce((s, e) => s + e.escritos, 0),
    detalhe: results,
  });
}
