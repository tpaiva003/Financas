/**
 * Tipos partilhados entre o servidor (parsing/dedup) e a UI do import.
 *
 * A pré-visualização é devolvida ao cliente, editada lá e reenviada ao servidor
 * para confirmação. Manter estes tipos pequenos: viajam serializados em JSON.
 */

export interface ImportPreviewRow {
  /** UID estável da transação: chave de deduplicação. */
  uid: string;
  description: string;
  transactionDate: string;
  /** Gasto positivo, reembolso/entrada negativo. */
  amountCents: number;
  /** Já existe uma despesa com este UID (ou repetida no próprio ficheiro). */
  isDuplicate: boolean;
  /** Categoria sugerida pelo motor de classificação (sobreponível). */
  suggestedCategoryId: string | null;
  /**
   * Possível correspondência com uma despesa metida à mão (REQ-IMP-5):
   * mesmo valor e data próxima. Serve para avisar antes de duplicar.
   */
  reconcileHint?: { expenseId: string; description: string; date: string } | null;
  /**
   * A data cai num período que já tem despesas registadas na app. Estas linhas
   * ficam DESLIGADAS por omissão, para nunca sobrepor dados já existentes.
   */
  inCoveredPeriod: boolean;
}

export interface ImportOption {
  id: string;
  name: string;
  icon?: string;
}

export interface ImportPreview {
  /** Ambiente de destino escolhido (pode não ser o ativo na app). */
  spaceId: string;
  spaceName: string;
  /** Categorias e participantes DESSE ambiente, para editar a pré-visualização. */
  categories: ImportOption[];
  members: ImportOption[];
  defaultPayerId: string;
  source: string;
  fileName: string;
  rowCount: number;
  newCount: number;
  duplicateCount: number;
  rows: ImportPreviewRow[];
  /** Descrição do mapeamento detetado, para o utilizador confirmar. */
  mappingLabel: string;
  /** Data da despesa mais recente já registada no ambiente (ou null). */
  lastExpenseDate: string | null;
  /** Data sugerida para começar a importar: o dia a seguir à última registada. */
  suggestedFromDate: string | null;
  /** Quantas linhas caem em período já coberto. */
  coveredCount: number;
}

/** Linha escolhida pelo utilizador para importar. */
export interface ImportCommitRow {
  uid: string;
  description: string;
  transactionDate: string;
  amountCents: number;
  categoryId: string | null;
  kind: "shared" | "personal";
}

export interface ImportCommitPayload {
  /** Ambiente onde as despesas vão ser criadas. */
  spaceId: string;
  source: string;
  fileName: string;
  rowCount: number;
  duplicateCount: number;
  payerId: string;
  splitType: "EQUAL" | "PERCENT" | "SOLE";
  percentA?: number;
  soleMemberId?: string;
  rows: ImportCommitRow[];
}

export const IMPORT_SOURCES = [
  { id: "activo", label: "Activo Bank" },
  { id: "bankinter", label: "Bankinter (conta)" },
  { id: "universo", label: "Universo (cartão, PDF)" },
  { id: "outro", label: "Outro banco / ficheiro" },
] as const;
