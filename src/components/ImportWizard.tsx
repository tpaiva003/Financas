"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  previewImportAction,
  commitImportAction,
  reportMissingBankAction,
  type ActionState,
  type ImportPreviewState,
} from "@/app/(app)/actions";
import { formatCents } from "@/lib/domain";
import { findSimilar } from "@/lib/import/similar";
import {
  IMPORT_SOURCES,
  type ImportCommitPayload,
  type ImportPreviewRow,
  type ImportSpaceInfo,
  type ImportUnknownSample,
} from "@/lib/import/types";

interface Opt {
  id: string;
  name: string;
  icon?: string;
}

interface RowState {
  include: boolean;
  categoryId: string;
  kind: "shared" | "personal";
  /** Ambiente para onde esta linha vai. */
  spaceId: string;
}

/** Dia seguinte a uma data ISO (aaaa-mm-dd). */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const emptyPreview: ImportPreviewState = {};
const emptyCommit: ActionState = {};

export function ImportWizard({
  spaces,
  currentSpaceId,
}: {
  spaces: Opt[];
  currentSpaceId: string;
}) {
  const [previewState, previewAction] = useFormState(previewImportAction, emptyPreview);
  const [commitState, commitAction] = useFormState(commitImportAction, emptyCommit);
  const preview = previewState.preview;

  return (
    <div className="space-y-6">
      {/* Passo 1 — escolher o ficheiro */}
      <form action={previewAction} className="card space-y-4 p-6">
        <div>
          <h2 className="label">1. Ficheiro do banco</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Carrega um ou vários extratos em Excel, CSV ou PDF (cartão Universo).
            As colunas são detetadas automaticamente e nada é gravado antes de
            confirmares.
          </p>
        </div>

        {/* O destino é explícito: importar não mexe no ambiente ativo por acidente. */}
        <div>
          <label className="label" htmlFor="imp-space">Ambiente por omissão</label>
          <select id="imp-space" name="spaceId" defaultValue={currentSpaceId} className="select">
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-fg-faint">
            É onde as linhas entram por omissão. No passo seguinte podes mandar
            cada despesa para outro ambiente, uma a uma ou em massa.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="imp-source">Banco</label>
            <select id="imp-source" name="source" defaultValue="activo" className="select">
              {IMPORT_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="imp-account">Conta / cartão (opcional)</label>
            <input id="imp-account" name="account" placeholder="ex.: conta ordenado" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="imp-file">Ficheiro</label>
          <input
            id="imp-file"
            name="file"
            type="file"
            required
            multiple
            accept=".xlsx,.xls,.csv,.txt,.tsv,.pdf"
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel2 file:px-3 file:py-2 file:text-sm file:text-fg hover:file:bg-panel2/70"
          />
        </div>

        {previewState.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {previewState.error}
          </p>
        ) : null}

        {/* Banco desconhecido: o utilizador indica as colunas e a app aprende. */}
        {previewState.sample ? <ManualMappingPanel sample={previewState.sample} /> : null}

        <PreviewButton hasPreview={Boolean(preview)} />
      </form>

      {/* Passo 2 — rever e confirmar */}
      {preview ? (
        <PreviewStep
          key={`${preview.defaultSpaceId}-${preview.fileName}-${preview.rowCount}`}
          preview={preview}
          action={commitAction}
          state={commitState}
        />
      ) : null}

      <MissingBankReport sample={previewState.sample ?? null} />
    </div>
  );
}

/**
 * Mapeamento manual de colunas (REQ-IMP-7).
 *
 * Quando não reconhecemos o ficheiro, mostramos as primeiras linhas e pedimos
 * ao utilizador para apontar as colunas. É isto que dispensa qualquer análise
 * automática: quem tem o ficheiro à frente sabe ler a tabela melhor do que nós.
 * Fica dentro do formulário do passo 1, por isso o ficheiro já escolhido é
 * reenviado tal como está.
 */
function ManualMappingPanel({ sample }: { sample: ImportUnknownSample }) {
  const width = sample.rows.reduce((max, r) => Math.max(max, r.length), 0);
  const [headerRow, setHeaderRow] = useState(0);
  const [hasSingleAmount, setHasSingleAmount] = useState(true);

  const columnName = (i: number) => {
    const label = (sample.rows[headerRow]?.[i] ?? "").trim();
    return label ? `${i + 1}. ${label}` : `Coluna ${i + 1}`;
  };
  const options = Array.from({ length: width }, (_, i) => (
    <option key={i} value={i}>{columnName(i)}</option>
  ));

  return (
    <div className="space-y-4 rounded-xl border border-hair bg-panel2/40 p-4">
      <input type="hidden" name="manual" value="1" />
      <div>
        <h3 className="label">Ensinar este banco</h3>
        <p className="text-sm text-fg-muted">
          Não conhecemos o formato de <span className="text-fg">{sample.fileName}</span>. Diz-nos
          onde estão a data, a descrição e o valor. Depois de confirmares que os
          dados saíram certos, guardamos o formato — deste banco fica aprendido
          para a próxima, para ti e para quem usar a app.
        </p>
      </div>

      {/* As primeiras linhas do ficheiro, com o número de cada coluna. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="w-10 pb-1 font-mono text-[10px] text-fg-faint">#</th>
              {Array.from({ length: width }, (_, i) => (
                <th key={i} className="px-2 pb-1 font-mono text-[10px] text-fg-faint">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row, r) => (
              <tr
                key={r}
                className={`border-t border-hair2 ${r === headerRow ? "bg-panel2 text-fg" : "text-fg-muted"}`}
              >
                <td className="py-1">
                  <label className="flex cursor-pointer items-center gap-1 font-mono text-[10px]">
                    <input
                      type="radio"
                      name="headerRow"
                      value={r}
                      checked={headerRow === r}
                      onChange={() => setHeaderRow(r)}
                      className="h-3 w-3 accent-fg"
                      aria-label={`Linha ${r + 1} é o cabeçalho`}
                    />
                    {r + 1}
                  </label>
                </td>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="max-w-[10rem] truncate px-2 py-1">{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-faint">
        Escolhe à esquerda a linha com os nomes das colunas (o cabeçalho).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="map-date">Coluna da data</label>
          <select id="map-date" name="dateCol" className="select" defaultValue="">
            <option value="">Escolher…</option>
            {options}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="map-desc">Coluna da descrição</label>
          <select id="map-desc" name="descriptionCol" className="select" defaultValue="">
            <option value="">Escolher…</option>
            {options}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setHasSingleAmount(true)}
          className={`rounded-xl border px-3 py-2 text-sm transition ${
            hasSingleAmount ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
          }`}
        >
          Uma coluna de valor
        </button>
        <button
          type="button"
          onClick={() => setHasSingleAmount(false)}
          className={`rounded-xl border px-3 py-2 text-sm transition ${
            !hasSingleAmount ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
          }`}
        >
          Débito e crédito separados
        </button>
      </div>

      {hasSingleAmount ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="map-amount">Coluna do valor</label>
            <select id="map-amount" name="amountCol" className="select" defaultValue="">
              <option value="">Escolher…</option>
              {options}
            </select>
            <p className="mt-1 text-xs text-fg-faint">Cuidado: o saldo não é o valor do movimento.</p>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-fg-muted">
            <input type="checkbox" name="invertSign" className="h-4 w-4 accent-fg" defaultChecked />
            Os gastos vêm com sinal negativo
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="map-debit">Coluna do débito (gastos)</label>
            <select id="map-debit" name="debitCol" className="select" defaultValue="">
              <option value="">Escolher…</option>
              {options}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="map-credit">Coluna do crédito (entradas)</label>
            <select id="map-credit" name="creditCol" className="select" defaultValue="">
              <option value="">Escolher…</option>
              {options}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reportar um banco em falta. Só vai o que está escrito no formulário — as
 * colunas que o utilizador vê e pode apagar. Nunca seguem valores nem saldos.
 */
function MissingBankReport({ sample }: { sample: ImportUnknownSample | null }) {
  const [state, action] = useFormState(reportMissingBankAction, emptyCommit);
  const header = sample?.rows[0]?.filter((c) => c.trim().length > 0).join(" | ") ?? "";

  if (state.ok) {
    return (
      <p className="card p-4 text-center text-sm text-credit">
        {state.message ?? "Pedido enviado."}
      </p>
    );
  }

  return (
    <details className="card p-4" open={Boolean(sample)}>
      <summary className="cursor-pointer text-sm font-medium text-fg">
        O teu banco não é reconhecido? Diz-nos qual é.
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <p className="text-sm text-fg-muted">
          Enviamos só o que está aqui escrito: o nome do banco e os nomes das
          colunas. Nunca seguem montantes, saldos nem movimentos.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rep-bank">Banco</label>
            <input id="rep-bank" name="bank" required placeholder="ex.: Millennium bcp" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="rep-type">Tipo de ficheiro</label>
            <input
              id="rep-type"
              name="fileType"
              placeholder="ex.: Excel, CSV, PDF"
              defaultValue={sample ? (sample.fileName.split(".").pop() ?? "") : ""}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rep-structure">Colunas do ficheiro (podes editar)</label>
          <textarea
            id="rep-structure"
            name="structure"
            rows={2}
            defaultValue={header}
            placeholder="ex.: Data | Descrição | Débito | Crédito | Saldo"
            className="input min-h-[56px] resize-y"
          />
        </div>
        <div>
          <label className="label" htmlFor="rep-note">Nota (opcional)</label>
          <textarea id="rep-note" name="note" rows={2} className="input min-h-[56px] resize-y" />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-debt">{state.error}</p>
        ) : null}
        <ReportButton />
      </form>
    </details>
  );
}

function ReportButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary text-sm">
      {pending ? "A enviar…" : "Reportar banco em falta"}
    </button>
  );
}

function PreviewStep({
  preview,
  action,
  state,
}: {
  preview: NonNullable<ImportPreviewState["preview"]>;
  action: (fd: FormData) => void;
  state: ActionState;
}) {
  const spaceById = useMemo(
    () => new Map(preview.spaces.map((s) => [s.id, s])),
    [preview.spaces],
  );
  const defaultSpace = spaceById.get(preview.defaultSpaceId) ?? preview.spaces[0]!;
  const members = defaultSpace.members;

  /** Estado de uma linha face ao ambiente que tem escolhido nesse momento. */
  const rowFacts = (r: ImportPreviewRow, spaceId: string) => {
    const space = spaceById.get(spaceId) ?? defaultSpace;
    const isDuplicate = space.duplicateUids.includes(r.uid);
    const inCoveredPeriod =
      space.lastExpenseDate !== null && r.transactionDate <= space.lastExpenseDate;
    return { space, isDuplicate, inCoveredPeriod };
  };

  // Só entra o que é seguro por omissão: nada de duplicados, nada de períodos já
  // registados na app e nada que pareça uma despesa manual já existente.
  const isEligible = (r: ImportPreviewRow, spaceId: string, from: string) => {
    const { isDuplicate, inCoveredPeriod } = rowFacts(r, spaceId);
    if (isDuplicate || r.repeatedInFile || r.reconcileHint) return false;
    if (from ? r.transactionDate < from : inCoveredPeriod) return false;
    return true;
  };

  const descriptions = useMemo(() => preview.rows.map((r) => r.description), [preview.rows]);

  const suggestedFrom = defaultSpace.lastExpenseDate
    ? nextDay(defaultSpace.lastExpenseDate)
    : "";
  const [fromDate, setFromDate] = useState(suggestedFrom);

  const [rows, setRows] = useState<RowState[]>(() =>
    preview.rows.map((r) => ({
      include: isEligible(r, preview.defaultSpaceId, suggestedFrom),
      categoryId: r.suggestedCategoryId ?? "",
      kind: "shared" as const,
      spaceId: preview.defaultSpaceId,
    })),
  );

  /** Muda a data de corte e volta a aplicar a seleção segura. */
  const applyFromDate = (value: string) => {
    setFromDate(value);
    setRows((prev) =>
      prev.map((r, i) => ({ ...r, include: isEligible(preview.rows[i]!, r.spaceId, value) })),
    );
  };
  const [payerId, setPayerId] = useState(
    defaultSpace.members.some((m) => m.id === defaultSpace.viewerMemberId)
      ? defaultSpace.viewerMemberId
      : (defaultSpace.members[0]?.id ?? ""),
  );
  const [splitType, setSplitType] = useState<"EQUAL" | "PERCENT" | "SOLE">("EQUAL");
  const [percentA, setPercentA] = useState(50);
  const [soleId, setSoleId] = useState(members[0]?.id ?? "");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSpace, setBulkSpace] = useState(preview.defaultSpaceId);

  // Guardar o formato: só faz sentido se foi o utilizador a indicar as colunas
  // e ainda não conhecíamos esta estrutura.
  const canSaveTemplate = preview.manualMapping && Boolean(preview.fingerprint && preview.mapping);
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [templateLabel, setTemplateLabel] = useState("");

  const isPair = members.length === 2;
  const selected = rows.filter((r) => r.include).length;
  const total = useMemo(
    () => preview.rows.reduce((sum, r, i) => (rows[i]?.include ? sum + r.amountCents : sum), 0),
    [preview.rows, rows],
  );

  const setRow = (i: number, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  /**
   * Ao classificar uma linha, propõe aplicar a mesma categoria às despesas do
   * mesmo comerciante que ainda não a têm. Fica uma proposta, nunca automático.
   */
  const [similarPrompt, setSimilarPrompt] = useState<{
    index: number;
    categoryId: string;
    targets: number[];
  } | null>(null);

  const setRowCategory = (i: number, categoryId: string) => {
    setRow(i, { categoryId });
    if (!categoryId) {
      setSimilarPrompt(null);
      return;
    }
    const spaceId = rows[i]!.spaceId;
    const targets = findSimilar(descriptions, i).filter(
      (idx) => idx !== i && rows[idx]!.spaceId === spaceId && rows[idx]!.categoryId !== categoryId,
    );
    setSimilarPrompt(targets.length > 0 ? { index: i, categoryId, targets } : null);
  };

  const applySimilar = () => {
    if (!similarPrompt) return;
    const { categoryId, targets } = similarPrompt;
    setRows((prev) => prev.map((r, idx) => (targets.includes(idx) ? { ...r, categoryId } : r)));
    setSimilarPrompt(null);
  };

  /**
   * Mudar de ambiente muda o que é duplicado e o que já está coberto, e as
   * categorias são de outro ambiente: por isso a categoria é reposta.
   */
  const setRowSpace = (i: number, spaceId: string) =>
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const { isDuplicate } = rowFacts(preview.rows[i]!, spaceId);
        return { ...r, spaceId, categoryId: "", include: isDuplicate ? false : r.include };
      }),
    );

  // "Selecionar todas" nunca liga duplicados: essa é uma garantia do produto.
  const setAllIncluded = (include: boolean) =>
    setRows((prev) =>
      prev.map((r, i) =>
        rowFacts(preview.rows[i]!, r.spaceId).isDuplicate ? r : { ...r, include },
      ),
    );

  const applyBulkCategory = () => {
    if (!bulkCategory) return;
    setRows((prev) => prev.map((r) => (r.include ? { ...r, categoryId: bulkCategory } : r)));
  };

  /** Envia as selecionadas para outro ambiente de uma vez. */
  const applyBulkSpace = () =>
    setRows((prev) =>
      prev.map((r) => (r.include ? { ...r, spaceId: bulkSpace, categoryId: "" } : r)),
    );

  /** Marca todas as selecionadas como pessoais ou partilhadas. */
  const applyBulkKind = (kind: "shared" | "personal") =>
    setRows((prev) => prev.map((r) => (r.include ? { ...r, kind } : r)));

  /**
   * Atalho para o caso comum: as contas partilhadas desse período já estão
   * acertadas, mas falta o histórico pessoal. Liga as linhas do período já
   * coberto e marca-as como pessoais, para não mexer no saldo com ninguém.
   */
  const includeCoveredAsPersonal = () =>
    setRows((prev) =>
      prev.map((r, i) => {
        const { isDuplicate, inCoveredPeriod } = rowFacts(preview.rows[i]!, r.spaceId);
        if (isDuplicate || !inCoveredPeriod) return r;
        return { ...r, include: true, kind: "personal" as const };
      }),
    );

  // Contagens vivas, sempre face ao ambiente atual de cada linha.
  const duplicateCount = preview.rows.reduce(
    (n, r, i) => (rowFacts(r, rows[i]!.spaceId).isDuplicate ? n + 1 : n),
    0,
  );
  const coveredCount = preview.rows.reduce(
    (n, r, i) => (rowFacts(r, rows[i]!.spaceId).inCoveredPeriod ? n + 1 : n),
    0,
  );
  const overlapping = preview.rows.reduce(
    (n, r, i) => (rows[i]!.include && rowFacts(r, rows[i]!.spaceId).inCoveredPeriod ? n + 1 : n),
    0,
  );
  const overlappingShared = preview.rows.reduce(
    (n, r, i) =>
      rows[i]!.include &&
      rows[i]!.kind === "shared" &&
      rowFacts(r, rows[i]!.spaceId).inCoveredPeriod
        ? n + 1
        : n,
    0,
  );
  const personalCount = rows.filter((r) => r.include && r.kind === "personal").length;
  // Resumo por ambiente das linhas que vão mesmo entrar.
  const perSpaceCounts = preview.spaces
    .map((s) => ({ name: s.name, count: rows.filter((r) => r.include && r.spaceId === s.id).length }))
    .filter((s) => s.count > 0);

  const payload: ImportCommitPayload = {
    defaultSpaceId: preview.defaultSpaceId,
    source: preview.source,
    fileName: preview.fileName,
    rowCount: preview.rowCount,
    duplicateCount,
    payerId,
    splitType,
    percentA,
    soleMemberId: soleId,
    rows: preview.rows
      .map((r, i) => ({ r, s: rows[i]! }))
      .filter(({ s }) => s.include)
      .map(({ r, s }) => ({
        uid: r.uid,
        description: r.description,
        transactionDate: r.transactionDate,
        amountCents: r.amountCents,
        categoryId: s.categoryId || null,
        kind: s.kind,
        spaceId: s.spaceId,
      })),
    saveTemplate:
      canSaveTemplate && saveTemplate && templateLabel.trim()
        ? {
            fingerprint: preview.fingerprint!,
            label: templateLabel.trim(),
            header: preview.header,
            mapping: preview.mapping!,
          }
        : null,
  };

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[15px] font-medium text-credit">{state.message ?? "Importado."}</p>
        <p className="mt-1 text-sm text-fg-muted">
          Podes anular qualquer lote abaixo, se for preciso.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-5 p-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div>
        <h2 className="label">2. Rever e confirmar</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {preview.rowCount} transação(ões) lidas ·{" "}
          <span className="text-fg">{preview.rowCount - duplicateCount} novas</span>
          {duplicateCount > 0 ? ` · ${duplicateCount} já existiam` : ""}
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          Destino:{" "}
          {perSpaceCounts.length === 0 ? (
            <span className="text-fg-faint">nada selecionado</span>
          ) : (
            perSpaceCounts.map((s, i) => (
              <span key={s.name}>
                {i > 0 ? " · " : ""}
                <span className="font-medium text-fg">{s.count}</span> em {s.name}
              </span>
            ))
          )}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
          {preview.mappingLabel}
        </p>
        {preview.knownTemplate ? (
          <p className="mt-2 text-xs text-credit">
            Formato conhecido: <span className="font-medium">{preview.knownTemplate}</span>. Foi
            alguém que o ensinou à app — as colunas vieram já certas.
          </p>
        ) : null}
      </div>

      {/* Aprender este banco: guarda-se o formato, nunca os movimentos. */}
      {canSaveTemplate ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-4">
          <label className="flex items-start gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={(e) => setSaveTemplate(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-fg"
            />
            <span>
              Guardar este formato para a próxima
              <span className="mt-0.5 block text-xs text-fg-muted">
                Confirma primeiro, em baixo, que as datas e os valores estão certos.
                Guardamos só os nomes das colunas e a que servem — nunca movimentos,
                montantes ou saldos. Fica disponível para quem importar o mesmo banco.
              </span>
            </span>
          </label>
          {saveTemplate ? (
            <div className="mt-3 max-w-sm">
              <label className="label" htmlFor="tpl-label">Nome deste formato</label>
              <input
                id="tpl-label"
                value={templateLabel}
                onChange={(e) => setTemplateLabel(e.target.value)}
                placeholder="ex.: Millennium bcp (conta)"
                className="input"
                maxLength={60}
              />
              {!templateLabel.trim() ? (
                <p className="mt-1 text-xs text-fg-faint">
                  Sem nome, importamos à mesma — só não fica guardado.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Proteção contra sobreposição com o que já está registado. */}
      <div className="rounded-xl border border-hair bg-panel2/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="from-date">Importar só a partir de</label>
            <input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => applyFromDate(e.target.value)}
              className="input"
            />
          </div>
          {fromDate ? (
            <button type="button" onClick={() => applyFromDate("")} className="btn-ghost text-xs">
              Sem limite de data
            </button>
          ) : null}
        </div>
        {defaultSpace.lastExpenseDate ? (
          <p className="mt-2 text-xs text-fg-muted">
            Em <span className="text-fg">{defaultSpace.name}</span>, a despesa mais recente já
            registada é de{" "}
            <span className="text-fg">
              {new Date(defaultSpace.lastExpenseDate).toLocaleDateString("pt-PT")}
            </span>
            . Para não sobrepor o que já lá está,{" "}
            {coveredCount > 0
              ? `${coveredCount} linha(s) desse período ficam desligadas`
              : "nada desse período foi selecionado"}
            . Podes ligar caso a caso se faltar alguma.
          </p>
        ) : (
          <p className="mt-2 text-xs text-fg-muted">
            Ainda não há despesas em {defaultSpace.name}, por isso não há risco de sobreposição.
          </p>
        )}

        {/* Atalho: recuperar o histórico pessoal de um período já acertado. */}
        {coveredCount > 0 ? (
          <button
            type="button"
            onClick={includeCoveredAsPersonal}
            className="btn-secondary mt-3 text-xs"
          >
            Incluir período já registado como despesas só minhas
          </button>
        ) : null}
      </div>

      {/* Aviso em tempo real: estás mesmo a acrescentar a um período já coberto. */}
      {overlapping > 0 ? (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${
            overlappingShared > 0
              ? "border-debt/40 bg-debt/10 text-debt"
              : "border-hair bg-panel2/40 text-fg-muted"
          }`}
        >
          <p className="font-medium">
            {overlapping} despesa(s) caem em período que já tem informação registada.
          </p>
          {overlappingShared > 0 ? (
            <p className="mt-1">
              Destas, <span className="font-medium">{overlappingShared} estão como partilhadas</span> e
              vão <span className="font-medium">alterar o saldo</span> desse período, que podes já ter
              acertado. Se o objetivo é só recuperar o teu histórico, marca-as como pessoais: contam
              para a tua análise e não mexem no saldo.
            </p>
          ) : (
            <p className="mt-1">
              Estão todas marcadas como pessoais: entram na tua análise e não mexem no saldo
              partilhado desse período.
            </p>
          )}
        </div>
      ) : null}

      {/* Definições aplicadas a todas as despesas importadas */}
      <div className="grid gap-4 rounded-xl border border-hair bg-panel2/40 p-4 sm:grid-cols-2">
        <div>
          <span className="label">Quem pagou</span>
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPayerId(m.id)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                  payerId === m.id ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Como se divide</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Toggle active={splitType === "EQUAL"} onClick={() => setSplitType("EQUAL")}>
              {isPair ? "50 / 50" : "Iguais"}
            </Toggle>
            {isPair ? (
              <Toggle active={splitType === "PERCENT"} onClick={() => setSplitType("PERCENT")}>%</Toggle>
            ) : null}
            <Toggle active={splitType === "SOLE"} onClick={() => setSplitType("SOLE")}>Só de um(a)</Toggle>
          </div>

          {splitType === "PERCENT" && isPair ? (
            <div className="mt-3">
              <div className="flex items-center justify-between font-mono text-xs text-fg-muted">
                <span>{members[0]!.name}: {percentA}%</span>
                <span>{members[1]!.name}: {100 - percentA}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percentA}
                onChange={(e) => setPercentA(Number(e.target.value))}
                className="mt-2 w-full accent-fg"
                aria-label={`Percentagem de ${members[0]!.name}`}
              />
            </div>
          ) : null}

          {splitType === "SOLE" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSoleId(m.id)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    soleId === m.id ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Ações em massa */}
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => setAllIncluded(true)} className="btn-ghost text-xs">
          Selecionar todas
        </button>
        <button type="button" onClick={() => setAllIncluded(false)} className="btn-ghost text-xs">
          Nenhuma
        </button>
        <span className="mx-1 hidden text-fg-faint sm:inline">·</span>
        <button type="button" onClick={() => applyBulkKind("personal")} className="btn-ghost text-xs">
          Marcar como pessoais
        </button>
        <button type="button" onClick={() => applyBulkKind("shared")} className="btn-ghost text-xs">
          Como partilhadas
        </button>
        {preview.spaces.length > 1 ? (
          <div className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="bulk-space">Enviar para</label>
              <select
                id="bulk-space"
                value={bulkSpace}
                onChange={(e) => setBulkSpace(e.target.value)}
                className="select"
              >
                {preview.spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={applyBulkSpace} className="btn-secondary text-xs">
              Mover selecionadas
            </button>
          </div>
        ) : null}
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="label" htmlFor="bulk-cat">Categoria em massa</label>
            <select
              id="bulk-cat"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="select"
            >
              <option value="">Escolher…</option>
              {defaultSpace.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={applyBulkCategory} className="btn-secondary text-xs">
            Aplicar às selecionadas
          </button>
        </div>
      </div>

      {/* Lista de transações */}
      <ul className="divide-y divide-hair2 rounded-xl border border-hair">
        {preview.rows.map((r, i) => {
          const facts = rowFacts(r, rows[i]!.spaceId);
          return (
            <PreviewRowItem
              key={`${r.uid}-${i}`}
              row={r}
              state={rows[i]!}
              spaces={preview.spaces}
              categories={facts.space.categories}
              isDuplicate={facts.isDuplicate}
              inCoveredPeriod={facts.inCoveredPeriod}
              onChange={(patch) => setRow(i, patch)}
              onCategoryChange={(categoryId) => setRowCategory(i, categoryId)}
              onSpaceChange={(spaceId) => setRowSpace(i, spaceId)}
              similarPrompt={
                similarPrompt?.index === i
                  ? {
                      count: similarPrompt.targets.length,
                      categoryName:
                        facts.space.categories.find((c) => c.id === similarPrompt.categoryId)?.name ??
                        "esta categoria",
                      onApply: applySimilar,
                      onDismiss: () => setSimilarPrompt(null),
                    }
                  : null
              }
            />
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
        <p className="text-sm text-fg-muted">
          <span className="text-fg">{selected}</span> selecionada(s)
          {personalCount > 0 ? ` · ${personalCount} pessoal(is)` : ""} · total{" "}
          <span className="font-mono tnum text-fg">{formatCents(total)}</span>
        </p>
        <CommitButton disabled={selected === 0} />
      </div>
    </form>
  );
}

function PreviewRowItem({
  row,
  state,
  spaces,
  categories,
  isDuplicate,
  inCoveredPeriod,
  onChange,
  onCategoryChange,
  onSpaceChange,
  similarPrompt,
}: {
  row: ImportPreviewRow;
  state: RowState;
  spaces: ImportSpaceInfo[];
  categories: Opt[];
  isDuplicate: boolean;
  inCoveredPeriod: boolean;
  onChange: (patch: Partial<RowState>) => void;
  onCategoryChange: (categoryId: string) => void;
  onSpaceChange: (spaceId: string) => void;
  similarPrompt: {
    count: number;
    categoryName: string;
    onApply: () => void;
    onDismiss: () => void;
  } | null;
}) {
  const isRefund = row.amountCents < 0;
  return (
    <li className={`p-3 ${state.include ? "" : "opacity-50"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={state.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 rounded border-hair bg-panel2 accent-fg"
          aria-label={`Importar ${row.description}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-fg">{row.description}</p>
            {isDuplicate ? <span className="chip border-hair text-fg-faint">já existe</span> : null}
            {row.repeatedInFile && !isDuplicate ? (
              <span className="chip border-hair text-fg-faint">repetida nos ficheiros</span>
            ) : null}
            {inCoveredPeriod && !isDuplicate ? (
              <span className="chip border-hair text-fg-faint">período já registado</span>
            ) : null}
            {row.reconcileHint ? (
              <span className="chip border-debt/30 text-debt" title={`Parece a despesa manual "${row.reconcileHint.description}"`}>
                possível repetida
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {new Date(row.transactionDate).toLocaleDateString("pt-PT")}
            {row.reconcileHint
              ? ` · igual a "${row.reconcileHint.description}" de ${new Date(row.reconcileHint.date).toLocaleDateString("pt-PT")}`
              : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Ambiente desta linha: o mesmo extrato pode alimentar vários. */}
            {spaces.length > 1 ? (
              <select
                value={state.spaceId}
                onChange={(e) => onSpaceChange(e.target.value)}
                className="select h-9 py-1 text-xs"
                aria-label={`Ambiente de ${row.description}`}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : null}
            <select
              value={state.categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="select h-9 py-1 text-xs"
              aria-label={`Categoria de ${row.description}`}
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange({ kind: state.kind === "shared" ? "personal" : "shared" })}
              title={
                state.kind === "personal"
                  ? "Só tua: entra na tua análise e não mexe no saldo"
                  : "Partilhada: entra no saldo com os outros participantes"
              }
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                state.kind === "personal"
                  ? "border-fg/40 bg-panel2 text-fg"
                  : "border-hair text-fg-muted hover:text-fg"
              }`}
            >
              {state.kind === "personal" ? "Pessoal" : "Partilhada"}
            </button>
          </div>
        </div>
        <div className={`shrink-0 font-mono text-sm tnum ${isRefund ? "text-credit" : "text-fg"}`}>
          {formatCents(row.amountCents)}
        </div>
      </div>
    </li>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
        active ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function PreviewButton({ hasPreview }: { hasPreview: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "A ler o ficheiro…" : hasPreview ? "Ler outro ficheiro" : "Pré-visualizar"}
    </button>
  );
}

function CommitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary">
      {pending ? "A importar…" : "Importar selecionadas"}
    </button>
  );
}
