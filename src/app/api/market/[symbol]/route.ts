import { getSpaceContext } from "@/lib/space";
import { fetchCompanyFinancials } from "@/lib/market";
import { SymbolNotFoundError } from "@/lib/market/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Dados financeiros de uma empresa, para a página de Avaliação.
 *
 * Fica atrás da sessão como todo o resto da app: é um endpoint que consome uma
 * API externa, e aberto seria um proxy gratuito para qualquer um.
 */
export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  await getSpaceContext();

  try {
    const data = await fetchCompanyFinancials(params.symbol);
    return Response.json(data);
  } catch (err) {
    if (err instanceof SymbolNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    // Falha da fonte externa: dizer o que aconteceu, não fingir que não há dados
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "A fonte de dados não respondeu. Preenche os campos à mão ou tenta daqui a pouco.",
      },
      { status: 502 },
    );
  }
}
