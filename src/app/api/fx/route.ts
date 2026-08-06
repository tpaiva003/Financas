import { getSpaceContext } from "@/lib/space";
import { fetchReferenceRate } from "@/lib/services/fx-rate";

export const dynamic = "force-dynamic";

/**
 * Taxa de câmbio de referência para uma moeda e uma data.
 *
 * Existe como endpoint, e não escondido dentro da ação de gravar, para a taxa
 * aparecer no formulário ANTES de se gravar. Quem regista vê o número, compara
 * com a nota da corretora e corrige se for outro. Uma conversão feita por trás
 * é impossível de conferir depois.
 *
 * Atrás de sessão como tudo o resto: não é dado sensível, mas também não há
 * motivo para a app ter uma porta aberta a quem não entrou.
 */
export async function GET(req: Request) {
  await getSpaceContext();

  const url = new URL(req.url);
  const currency = url.searchParams.get("currency") ?? "";
  const date = url.searchParams.get("date");

  const result = await fetchReferenceRate(currency, date);
  if (!result) {
    return Response.json(
      { error: "Não consegui obter a taxa. Escreve a que te aplicaram." },
      { status: 502 },
    );
  }
  return Response.json(result);
}
