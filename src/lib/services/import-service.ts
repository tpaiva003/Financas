/**
 * Importação de extratos bancários (REQ-IMP).
 *
 * Fluxo: ficheiro → grelha → mapeamento de colunas → transações normalizadas →
 * dedup por UID estável + sugestão de categoria + aviso de reconciliação com
 * entradas manuais. A confirmação cria as despesas num lote reversível.
 *
 * Invariantes respeitados:
 *  - a mesma transação nunca entra duas vezes (UID estável, ver dedup.ts);
 *  - "quem pagou" é independente de "como se divide";
 *  - a classificação é só uma SUGESTÃO, sempre sobreponível na pré-visualização.
 */

import { getRepository } from "@/lib/data";
import { classify, stableUid, suggestReconciliation } from "@/lib/domain";
import type { Split, NormalizedTransaction } from "@/lib/domain";
import {
  detectMapping,
  rowsToTransactions,
  headerFingerprint,
  headerColumns,
} from "@/lib/import/columns";
import type { ColumnMapping, Grid } from "@/lib/import/columns";
import { readUploadToGrid, MAX_IMPORT_BYTES } from "@/lib/import/read-file";
import type {
  ImportCommitPayload,
  ImportPreview,
  ImportPreviewRow,
  ImportSpaceInfo,
  ImportUnknownSample,
  ManualMapping,
} from "@/lib/import/types";
import type { TargetSpace } from "@/lib/space";

/**
 * Erro de importação. Quando o ficheiro não é reconhecido levamos connosco as
 * primeiras linhas (`sample`) para o utilizador poder indicar as colunas à mão.
 */
export class ImportError extends Error {
  sample?: ImportUnknownSample | null;
  constructor(message: string, sample?: ImportUnknownSample | null) {
    super(message);
    this.sample = sample ?? null;
  }
}

/** Lê o ficheiro e devolve a pré-visualização já deduplicada e classificada. */
export async function buildImportPreview(params: {
  /** Um ou vários extratos, lidos de uma só vez. */
  files: File[];
  source: string;
  account?: string | null;
  /** Ambientes a que o utilizador pertence e onde pode escrever. */
  targets: TargetSpace[];
  /** Ambiente sugerido por omissão para as linhas. */
  defaultSpaceId: string;
  /**
   * Colunas indicadas à mão pelo utilizador, quando a deteção falhou. Ganham a
   * todo o resto: é o utilizador a olhar para o ficheiro.
   */
  manualMapping?: ManualMapping | null;
}): Promise<ImportPreview> {
  const { files, source, account, targets, defaultSpaceId, manualMapping } = params;
  if (targets.length === 0) throw new ImportError("Não tens ambientes onde importar.");

  const usable = files.filter((f) => f && f.size > 0);
  if (usable.length === 0) throw new ImportError("Escolhe pelo menos um ficheiro.");
  if (usable.some((f) => f.size > MAX_IMPORT_BYTES)) {
    throw new ImportError("Há um ficheiro demasiado grande (máximo 8 MB por ficheiro).");
  }

  const transactions: NormalizedTransaction[] = [];
  const failed: string[] = [];
  let mappingLabel = "";
  let fingerprint: string | null = null;
  let header: string[] = [];
  let confirmedMapping: ColumnMapping | null = null;
  let templateLabel: string | null = null;
  let unknownSample: { fileName: string; rows: string[][] } | null = null;

  for (const file of usable) {
    let grid;
    try {
      grid = await readUploadToGrid(file);
    } catch {
      failed.push(file.name);
      continue;
    }
    let mapping: ColumnMapping | null = null;

    if (manualMapping) {
      // O utilizador já disse quais são as colunas: não adivinhamos nada.
      mapping = { ...manualMapping };
    } else if (grid.length > 0) {
      // Se já alguém confirmou esta estrutura, o mapeamento guardado tem
      // prioridade: foi validado por uma pessoa, a deteção é só um palpite.
      for (let r = 0; r < Math.min(grid.length, 25); r++) {
        const fp = headerFingerprint(grid, r);
        if (!fp) continue;
        const tpl = await getRepository()
          .findImportTemplate(fp)
          .catch(() => null);
        if (tpl) {
          mapping = tpl.mapping as unknown as ColumnMapping;
          templateLabel = tpl.label;
          break;
        }
      }
      mapping = mapping ?? detectMapping(grid);
    }

    if (!mapping) {
      failed.push(file.name);
      // Guardamos a estrutura para o utilizador poder mapear à mão.
      if (grid.length > 0 && !unknownSample) {
        unknownSample = {
          fileName: file.name,
          rows: grid.slice(0, 12).map((r) => r.map((c) => (c ?? "").toString())),
        };
      }
      continue;
    }

    // Estrutura reconhecida: guardamos a impressão digital para poder gravar
    // como template quando o utilizador confirmar que os dados estão certos.
    if (!fingerprint) {
      fingerprint = headerFingerprint(grid, mapping.headerRow);
      header = headerColumns(grid, mapping.headerRow);
      confirmedMapping = mapping;
    }

    const txs = rowsToTransactions(grid, mapping, source, account ?? null);
    if (txs.length === 0) {
      failed.push(file.name);
      continue;
    }
    transactions.push(...txs);
    if (!mappingLabel) mappingLabel = describeMapping(grid, mapping);
  }

  if (transactions.length === 0) {
    // Em vez de um beco sem saída, devolvemos a estrutura para o utilizador
    // mapear à mão, é assim que a app aprende bancos novos.
    throw new ImportError(
      manualMapping
        ? "Com essas colunas não consegui ler nenhum movimento. Confere a linha do cabeçalho e as colunas escolhidas."
        : "Não reconheci as colunas deste ficheiro. Indica quais são, em baixo, para eu aprender.",
      unknownSample,
    );
  }

  const repo = getRepository();
  const rules = await repo.listClassificationRules();

  // Recolhe o estado de TODOS os ambientes do utilizador: como cada linha pode
  // ir para um ambiente diferente, o dedup e o aviso de período têm de ser
  // avaliados por ambiente.
  const uidsInFile = new Set(transactions.map((t) => stableUid(t)));
  const spaces: ImportSpaceInfo[] = await Promise.all(
    targets.map(async (t) => {
      const [uids, cats, expenses] = await Promise.all([
        repo.listExpenseUids(t.space.id),
        repo.listCategories(t.space.id),
        repo.listExpenses({ spaceId: t.space.id, viewerId: t.viewerMemberId }),
      ]);
      const lastExpenseDate = expenses.reduce<string | null>(
        (max, e) =>
          !e.deletedAt && (max === null || e.transactionDate > max) ? e.transactionDate : max,
        null,
      );
      return {
        id: t.space.id,
        name: t.space.name,
        categories: cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
        members: t.fullMembers.map((m) => ({ id: m.id, name: m.name })),
        viewerMemberId: t.viewerMemberId,
        lastExpenseDate,
        // Só a interseção com este ficheiro: mantém o payload pequeno.
        duplicateUids: uids.filter((u) => uidsInFile.has(u.uid)).map((u) => u.uid),
      };
    }),
  );

  // Sugestão de reconciliação com entradas manuais, no ambiente por omissão.
  const defaultTarget = targets.find((t) => t.space.id === defaultSpaceId) ?? targets[0]!;
  const defaultExpenses = await repo.listExpenses({
    spaceId: defaultTarget.space.id,
    viewerId: defaultTarget.viewerMemberId,
  });
  const reconciliations = suggestReconciliation(transactions, defaultExpenses);
  const byUid = new Map(reconciliations.map((r) => [r.uid, r.candidateExpenseId]));
  const expenseById = new Map(defaultExpenses.map((e) => [e.id, e]));

  // Repetições DENTRO do próprio lote (o mesmo movimento em dois ficheiros que
  // se sobrepõem). Só a primeira ocorrência conta como nova.
  const seen = new Set<string>();

  const rows: ImportPreviewRow[] = transactions.map((tx) => {
    const uid = stableUid(tx);
    const repeatedInFile = seen.has(uid);
    seen.add(uid);
    const hintExpense = expenseById.get(byUid.get(uid) ?? "");
    return {
      uid,
      description: tx.description,
      transactionDate: tx.transactionDate,
      amountCents: tx.amountCents,
      suggestedCategoryId: classify(tx.description, rules).categoryId ?? null,
      repeatedInFile,
      reconcileHint: hintExpense
        ? {
            expenseId: hintExpense.id,
            description: hintExpense.description,
            date: hintExpense.transactionDate,
          }
        : null,
    };
  });

  return {
    defaultSpaceId: defaultTarget.space.id,
    spaces,
    source,
    fileName: usable.map((f) => f.name).join(", "),
    fileCount: usable.length,
    failedFiles: failed,
    rowCount: transactions.length,
    rows,
    mappingLabel: templateLabel ? `${templateLabel} · ${mappingLabel}` : mappingLabel,
    fingerprint,
    header,
    mapping: confirmedMapping ? { ...confirmedMapping } : null,
    knownTemplate: templateLabel,
    // Só vale a pena propor guardar um template se foi o utilizador a mapear e
    // ainda não conhecíamos esta estrutura.
    manualMapping: Boolean(manualMapping) && !templateLabel,
  };
}

/** Descrição legível do mapeamento detetado, para o utilizador confirmar. */
function describeMapping(grid: Grid, mapping: ColumnMapping): string {
  const header = grid[mapping.headerRow];
  const label = (i: number) => (i >= 0 ? (header?.[i] ?? `coluna ${i + 1}`) : null);
  const amountLabel =
    mapping.amountCol >= 0
      ? `valor: ${label(mapping.amountCol)}${mapping.invertSign ? " (sinal invertido)" : ""}`
      : `débito: ${label(mapping.debitCol)} · crédito: ${label(mapping.creditCol)}`;
  return `data: ${label(mapping.dateCol)} · descrição: ${label(mapping.descriptionCol)} · ${amountLabel}`;
}

/**
 * Cria as despesas escolhidas. As linhas podem ir para ambientes diferentes:
 * agrupa-se por ambiente e cria-se um lote reversível em cada um.
 */
export async function commitImport(params: {
  payload: ImportCommitPayload;
  /** Ambientes onde o utilizador pode escrever, já validados. */
  targets: TargetSpace[];
  defaultSpaceId: string;
  userId: string;
}): Promise<{ imported: number; perSpace: { spaceName: string; count: number }[] }> {
  const { payload, targets, defaultSpaceId, userId } = params;

  const rows = payload.rows.filter((r) => r.amountCents !== 0);
  if (rows.length === 0) throw new ImportError("Não escolheste nenhuma despesa para importar.");

  const byId = new Map(targets.map((t) => [t.space.id, t]));
  const defaultTarget = byId.get(defaultSpaceId) ?? targets[0];
  if (!defaultTarget) throw new ImportError("Ambiente inválido.");

  const defaultMemberIds = defaultTarget.fullMembers.map((m) => m.id);
  if (!defaultMemberIds.includes(payload.payerId)) throw new ImportError("Pagador inválido.");
  const defaultSplit = buildImportSplit(payload, defaultMemberIds);

  // O pagador é uma pessoa, não um id: noutro ambiente é o participante ligado
  // ao mesmo utilizador.
  const payerUserId = defaultTarget.fullMembers.find((m) => m.id === payload.payerId)?.linkedUserId;

  const repo = getRepository();

  // O utilizador confirmou que os dados saíram certos: guardamos a estrutura
  // para o próximo ficheiro deste banco ser reconhecido logo, por qualquer
  // pessoa. Só nomes de colunas e índices, nunca valores nem montantes.
  const tpl = payload.saveTemplate;
  if (tpl?.fingerprint && tpl.label.trim()) {
    await repo
      .saveImportTemplate({
        fingerprint: tpl.fingerprint,
        label: tpl.label.trim().slice(0, 60),
        header: tpl.header,
        mapping: tpl.mapping,
        createdBy: userId,
      })
      .catch(() => {
        // Guardar o template é um extra: nunca deve impedir a importação.
      });
  }

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const id = byId.has(row.spaceId) ? row.spaceId : defaultTarget.space.id;
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }

  let imported = 0;
  const perSpace: { spaceName: string; count: number }[] = [];

  for (const [spaceId, spaceRows] of grouped) {
    const target = byId.get(spaceId)!;
    const isDefault = spaceId === defaultTarget.space.id;

    const payerId = isDefault
      ? payload.payerId
      : (target.fullMembers.find((m) => m.linkedUserId && m.linkedUserId === payerUserId)?.id ??
        target.viewerMemberId);

    // A divisão em percentagem é definida para participantes concretos, por isso
    // não se transfere entre ambientes: fora do ambiente por omissão, é igual.
    const split: Split = isDefault ? defaultSplit : { type: "EQUAL" };

    // O lote permite anular a importação. Se a tabela ainda não existir
    // (migração por aplicar), importamos na mesma: o dedup por UID continua a
    // proteger contra duplicados; só se perde o "anular lote".
    // Data da transação mais recente: é daqui que sai o "importar desde" da
    // próxima vez, sem ter de varrer o histórico todo.
    const lastTransactionDate = spaceRows.reduce<string | null>(
      (max, r) => (max === null || r.transactionDate > max ? r.transactionDate : max),
      null,
    );

    let batchId: string | null = null;
    try {
      const batch = await repo.createImportBatch({
        spaceId,
        source: payload.source,
        fileName: payload.fileName,
        rowCount: payload.rowCount,
        importedCount: spaceRows.length,
        duplicateCount: payload.duplicateCount,
        lastTransactionDate,
        createdBy: userId,
      });
      batchId = batch.id;
    } catch {
      batchId = null;
    }

    for (const row of spaceRows) {
      const kind = row.kind === "personal" ? "personal" : "shared";
      await repo.createExpense({
        spaceId,
        description: row.description,
        amountCents: row.amountCents,
        currency: "EUR",
        transactionDate: row.transactionDate,
        categoryId: row.categoryId || null,
        payerId,
        kind,
        split: kind === "personal" ? { type: "EQUAL" } : split,
        origin: "import",
        status: "confirmed",
        ownerId: kind === "personal" ? target.viewerMemberId : payerId,
        visibleToPartner: false,
        createdBy: userId,
        // UID do extrato: garante que reimportar o ficheiro não duplica.
        uid: row.uid,
        importBatchId: batchId,
      });
      imported += 1;
    }

    perSpace.push({ spaceName: target.space.name, count: spaceRows.length });
  }

  return { imported, perSpace };
}

function buildImportSplit(payload: ImportCommitPayload, memberIds: string[]): Split {
  if (payload.splitType === "SOLE") {
    const target = payload.soleMemberId;
    if (!target || !memberIds.includes(target)) {
      throw new ImportError("Escolhe de quem é a despesa.");
    }
    const weights: Record<string, number> = {};
    for (const id of memberIds) weights[id] = id === target ? 100 : 0;
    return { type: "PERCENT", weights };
  }

  if (payload.splitType === "PERCENT" && memberIds.length === 2) {
    const pa = payload.percentA ?? 50;
    if (pa < 0 || pa > 100) throw new ImportError("Percentagem inválida.");
    return { type: "PERCENT", weights: { [memberIds[0]!]: pa, [memberIds[1]!]: 100 - pa } };
  }

  return { type: "EQUAL" };
}
