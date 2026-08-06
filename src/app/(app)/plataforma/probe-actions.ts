"use server";

import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/users";
import { getRepository } from "@/lib/data";
import { BENCHMARKS, symbolCandidates } from "@/lib/domain";
import { probeQuoteSource, type QuoteProbe } from "@/lib/services/quotes-service";

export interface ProbeState {
  error?: string;
  probes?: QuoteProbe[];
}

/**
 * Testa a fonte de cotações a partir do servidor.
 *
 * Tem de correr no servidor porque é ele que vai buscar as cotações em
 * produção: testar do browser respondia a outra pergunta.
 */
export async function probeQuotesAction(
  _prev: ProbeState,
  _formData: FormData,
): Promise<ProbeState> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return { error: "Sem permissão." };

  // Os índices, mais os símbolos que alguém registou de facto. Um teste com
  // símbolos inventados não diz nada sobre a carteira de ninguém.
  const registados = await getRepository()
    .listAllAssetSymbols()
    .catch(() => []);

  // Os símbolos registados entram com as suas variantes: se alguém escreveu
  // "MSFT", o que interessa saber é se "msft.us" funciona.
  const symbols = [
    ...new Set([
      ...BENCHMARKS.flatMap((b) => b.symbols),
      ...registados.flatMap((r) => symbolCandidates(r)),
    ]),
  ].slice(0, 16);

  return { probes: await probeQuoteSource(symbols) };
}
