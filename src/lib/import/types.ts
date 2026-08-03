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
  /** Categoria sugerida pelo motor de classificação (sobreponível). */
  suggestedCategoryId: string | null;
  /**
   * Possível correspondência com uma despesa metida à mão (REQ-IMP-5):
   * mesmo valor e data próxima. Serve para avisar antes de duplicar.
   */
  reconcileHint?: { expenseId: string; description: string; date: string } | null;
}

export interface ImportOption {
  id: string;
  name: string;
  icon?: string;
}

/**
 * Tudo o que a UI precisa de saber sobre um ambiente para onde as linhas podem
 * ser enviadas. Vem um destes por cada ambiente do utilizador, para se poder
 * escolher o destino linha a linha sem novo pedido ao servidor.
 */
export interface ImportSpaceInfo {
  id: string;
  name: string;
  categories: ImportOption[];
  members: ImportOption[];
  /** Participante que corresponde ao utilizador neste ambiente. */
  viewerMemberId: string;
  /** Data da despesa mais recente já registada neste ambiente. */
  lastExpenseDate: string | null;
  /**
   * UIDs DESTE import que já existem neste ambiente. É só a interseção, por
   * isso é pequeno mesmo com muitos anos de histórico.
   */
  duplicateUids: string[];
}

export interface ImportPreview {
  /** Ambiente sugerido por omissão; cada linha pode ir para outro. */
  defaultSpaceId: string;
  /** Todos os ambientes do utilizador, com o que é preciso para editar linhas. */
  spaces: ImportSpaceInfo[];
  source: string;
  fileName: string;
  rowCount: number;
  rows: ImportPreviewRow[];
  /** Descrição do mapeamento detetado, para o utilizador confirmar. */
  mappingLabel: string;
}

/** Linha escolhida pelo utilizador para importar. */
export interface ImportCommitRow {
  uid: string;
  description: string;
  transactionDate: string;
  amountCents: number;
  categoryId: string | null;
  kind: "shared" | "personal";
  /** Ambiente de destino desta linha. */
  spaceId: string;
}

export interface ImportCommitPayload {
  /**
   * Ambiente escolhido no passo 1. Define o contexto do pagador e da regra de
   * divisão; as linhas podem, ainda assim, ir para outros ambientes.
   */
  defaultSpaceId: string;
  source: string;
  fileName: string;
  rowCount: number;
  duplicateCount: number;
  /**
   * Pagador escolhido, no ambiente por omissão. Em linhas enviadas para outro
   * ambiente, o pagador é a MESMA pessoa, reencontrada nesse ambiente.
   */
  payerId: string;
  /**
   * Regra de divisão, aplicada às linhas do ambiente por omissão. Linhas
   * enviadas para outro ambiente ficam em partes iguais (as percentagens são
   * definidas para participantes concretos e não se transferem).
   */
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
