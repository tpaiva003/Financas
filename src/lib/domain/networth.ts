/**
 * Património: o que se tem menos o que se deve.
 *
 * Um "bem" pode ser uma conta a prazo, um imóvel, um carro, ou um investimento
 * com unidades (ETFs, ações). As dívidas (crédito à habitação, cartão) entram
 * na mesma lista, com sinal contrário, para o património líquido sair de uma
 * conta só.
 *
 * Para investimentos, o valor atual é quantidade x preço unitário. Enquanto não
 * houver cotações automáticas, o preço atual é escrito à mão; se faltar, usa-se
 * o preço de compra, o que faz o ganho ser zero em vez de inventar um número.
 *
 * Lógica pura, sem acesso a dados.
 */

export type AssetKind = "conta" | "investimento" | "imovel" | "outro" | "divida";

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  conta: "Contas e depósitos",
  investimento: "Investimentos",
  imovel: "Imóveis",
  outro: "Outros bens",
  divida: "Dívidas",
};

export interface AssetInput {
  id: string;
  name: string;
  kind: AssetKind;
  /** Unidades detidas (só investimentos). */
  quantity?: number | null;
  /** Preço médio de compra por unidade, em cêntimos (só investimentos). */
  unitCostCents?: number | null;
  /** Preço atual por unidade, em cêntimos (só investimentos). */
  unitPriceCents?: number | null;
  /** Valor atual, em cêntimos (tudo o que não é investimento). */
  valueCents?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
  /** Taxa anual nominal, em percentagem: o que rende, ou o que custa. */
  interestRatePct?: number | null;
  /** Prestação mensal, em cêntimos (dívidas com plano de amortização). */
  monthlyPaymentCents?: number | null;
  /** Meses que faltam pagar. */
  termMonths?: number | null;
  /** "fixa" ou "variavel". */
  rateKind?: string | null;
  /** Crédito: data do último pagamento. */
  maturityDate?: string | null;
  /** Crédito com períodos de taxa. Cru: ler com `parseCreditTerms`. */
  creditTerms?: unknown;
  /**
   * Que fatia deste bem é deste ambiente, em percentagem. `null` = tudo.
   *
   * Uma casa comprada a meias com alguém não é um bem de 300 mil no teu
   * património: são 150 mil teus. E o crédito que a paga também é metade. Sem
   * isto, quem compra a meias vê o património e a dívida inflacionados ao dobro
   * — os dois erros até se disfarçam um ao outro no valor líquido, e depois
   * mentem os dois no valor bruto, na prestação e no plano.
   */
  ownershipPct?: number | null;
  /**
   * Quem tem o resto, quando é alguém deste ambiente. Só para o registo.
   *
   * Não mexe na conta de propósito: a quota diz sempre e só quanto conta, sem
   * exceções escondidas. Serve para a app poder avisar que, se as duas metades
   * estão as duas cá dentro, provavelmente a quota devia ser 100%.
   */
  coOwnerMemberId?: string | null;
}

export interface AssetView extends AssetInput {
  /** Quanto vale hoje, em cêntimos. Positivo mesmo nas dívidas. */
  currentValueCents: number;
  /** Quanto custou, em cêntimos. Só faz sentido em investimentos. */
  costCents: number | null;
  /** Ganho ou perda por valorização (atual menos custo). */
  gainCents: number | null;
  gainPct: number | null;
  /** Falta o preço atual: o ganho mostrado seria falso. */
  missingPrice: boolean;
}

export interface NetWorth {
  assets: AssetView[];
  /** Soma de tudo o que não é dívida. */
  totalAssetsCents: number;
  /** Soma das dívidas, em positivo. */
  totalLiabilitiesCents: number;
  /** Bens menos dívidas. */
  netCents: number;
  /** Totais por tipo, para o gráfico. */
  byKind: { kind: AssetKind; label: string; totalCents: number }[];
  /** Ganho acumulado dos investimentos com preço atual conhecido. */
  investmentGainCents: number;
  investmentCostCents: number;
  /** Investimentos sem preço atual: o ganho está incompleto. */
  investmentsMissingPrice: number;
}

/** Valor atual de um bem, em cêntimos. */
/**
 * A quota deste ambiente no bem, entre 0 e 1. Sem quota escrita, é tudo.
 *
 * Nunca devolve zero por engano: um campo em branco, um texto, ou um número
 * fora do intervalo valem "tudo", não "nada". Um bem que valesse zero por causa
 * de um campo mal preenchido desaparecia do património sem dizer nada.
 */
export function ownershipShare(a: Pick<AssetInput, "ownershipPct">): number {
  const pct = a.ownershipPct;
  if (typeof pct !== "number" || !Number.isFinite(pct)) return 1;
  if (pct <= 0 || pct > 100) return 1;
  return pct / 100;
}

/** Quanto o bem vale por inteiro, sem olhar à quota. */
export function assetTotalValueCents(a: AssetInput): number {
  if (a.kind === "investimento") {
    const qty = a.quantity ?? 0;
    // Sem preço atual, vale o que custou: melhor do que fingir uma valorização.
    const unit = a.unitPriceCents ?? a.unitCostCents ?? 0;
    return Math.round(qty * unit);
  }
  return Math.round(a.valueCents ?? 0);
}

/**
 * Quanto do bem conta para este ambiente, em cêntimos.
 *
 * É esta que manda em tudo o que soma: património, dívidas, prestações, plano
 * do crédito. O valor por inteiro fica no `assetTotalValueCents`, para se poder
 * mostrar a casa toda ao lado da parte que é tua.
 */
export function assetValueCents(a: AssetInput): number {
  return Math.round(assetTotalValueCents(a) * ownershipShare(a));
}

/** Quanto custou um investimento, em cêntimos. Null se não for investimento. */
export function assetCostCents(a: AssetInput): number | null {
  if (a.kind !== "investimento") return null;
  // Também pela quota: senão uma carteira a meias mostrava um ganho sobre um
  // custo que não é o que saiu do bolso de ninguém.
  return Math.round((a.quantity ?? 0) * (a.unitCostCents ?? 0) * ownershipShare(a));
}

export function buildNetWorth(input: AssetInput[]): NetWorth {
  const assets: AssetView[] = input.map((a) => {
    const currentValueCents = assetValueCents(a);
    const costCents = assetCostCents(a);
    const missingPrice = a.kind === "investimento" && (a.unitPriceCents ?? null) === null;
    const gainCents = costCents === null || missingPrice ? null : currentValueCents - costCents;
    return {
      ...a,
      currentValueCents,
      costCents,
      gainCents,
      gainPct:
        gainCents === null || costCents === null || costCents === 0
          ? null
          : (gainCents / costCents) * 100,
      missingPrice,
    };
  });

  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  const kindTotals = new Map<AssetKind, number>();

  for (const a of assets) {
    if (a.kind === "divida") totalLiabilitiesCents += a.currentValueCents;
    else totalAssetsCents += a.currentValueCents;
    kindTotals.set(a.kind, (kindTotals.get(a.kind) ?? 0) + a.currentValueCents);
  }

  const investments = assets.filter((a) => a.kind === "investimento");
  const withPrice = investments.filter((a) => !a.missingPrice);

  return {
    assets,
    totalAssetsCents,
    totalLiabilitiesCents,
    netCents: totalAssetsCents - totalLiabilitiesCents,
    byKind: (Object.keys(ASSET_KIND_LABELS) as AssetKind[])
      .map((kind) => ({
        kind,
        label: ASSET_KIND_LABELS[kind],
        totalCents: kindTotals.get(kind) ?? 0,
      }))
      .filter((k) => k.totalCents !== 0),
    investmentGainCents: withPrice.reduce((s, a) => s + (a.gainCents ?? 0), 0),
    investmentCostCents: withPrice.reduce((s, a) => s + (a.costCents ?? 0), 0),
    investmentsMissingPrice: investments.length - withPrice.length,
  };
}
