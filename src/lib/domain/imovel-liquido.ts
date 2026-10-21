/**
 * Quanto é que a casa é mesmo minha.
 *
 * **A pergunta que não tinha resposta.** Um imóvel de 300 mil com 200 mil por
 * pagar são duas linhas no património que a app mostrava separadas: o bem de um
 * lado, a dívida do outro. O líquido existia no total, diluído entre o saldo das
 * contas e a carteira de ações — e a pergunta que toda a gente faz sobre a sua
 * casa não se via em ecrã nenhum.
 *
 * **A quota já está aplicada nos dois lados.** Uma casa a meias entra no
 * património com metade do valor, e o crédito dessa casa entra com metade do
 * saldo. Subtrair um do outro mantém a proporção sem ter de a aplicar outra vez
 * — e aplicá-la de novo aqui daria metade de metade, que é o engano que a app
 * já cometeu uma vez com as quotas.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface BemComCredito {
  id: string;
  name: string;
  /** O valor do bem já com a quota deste ambiente aplicada. */
  valueCents: number;
}

export interface CreditoDoBem {
  id: string;
  name: string;
  /** O que falta pagar, já com a quota aplicada. */
  balanceCents: number;
  /** Que bem financia. */
  financesAssetId?: string | null;
}

export interface LiquidoDoBem {
  assetId: string;
  /** O que falta pagar, somando todos os créditos ligados a este bem. */
  dividaCents: number;
  /** Valor menos dívida. Pode ser negativo — e quando é, é preciso dizê-lo. */
  liquidoCents: number;
  /** Que fatia do bem já está paga, em percentagem. `null` sem valor. */
  pagoPct: number | null;
  /** Quantos créditos entraram na conta, para o ecrã os poder nomear. */
  creditos: { id: string; name: string; balanceCents: number }[];
}

/**
 * O líquido de cada bem que tenha crédito associado.
 *
 * Os bens sem crédito nenhum ficam de fora: mostrar "líquido igual ao valor"
 * numa conta a prazo é ruído, e a linha já diz o valor.
 */
export function liquidoPorBem(
  bens: readonly BemComCredito[],
  creditos: readonly CreditoDoBem[],
): Map<string, LiquidoDoBem> {
  const out = new Map<string, LiquidoDoBem>();
  const porBem = new Map<string, CreditoDoBem[]>();

  for (const c of creditos) {
    if (!c.financesAssetId) continue;
    porBem.set(c.financesAssetId, [...(porBem.get(c.financesAssetId) ?? []), c]);
  }

  for (const bem of bens) {
    const ligados = porBem.get(bem.id);
    if (!ligados || ligados.length === 0) continue;
    const dividaCents = ligados.reduce((s, c) => s + c.balanceCents, 0);
    out.set(bem.id, {
      assetId: bem.id,
      dividaCents,
      liquidoCents: bem.valueCents - dividaCents,
      // Sem valor não há fatia nenhuma para calcular, e 0% seria dizer que
      // nada está pago — quando o que não se sabe é quanto vale.
      pagoPct:
        bem.valueCents > 0
          ? Math.max(0, Math.min(100, Math.round(((bem.valueCents - dividaCents) / bem.valueCents) * 100)))
          : null,
      creditos: ligados.map((c) => ({ id: c.id, name: c.name, balanceCents: c.balanceCents })),
    });
  }

  return out;
}
