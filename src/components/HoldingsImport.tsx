"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  previewHoldingsAction,
  commitHoldingsAction,
  type HoldingsState,
} from "@/app/(app)/patrimonio/importar/actions";
import { formatCents } from "@/lib/domain";

const empty: HoldingsState = {};

/**
 * Importar posições de uma corretora.
 *
 * Mesmo caminho dos extratos bancários: formato conhecido, deteção, ou o
 * utilizador aponta as colunas. Depois de confirmar que os dados saíram certos,
 * o formato fica na biblioteca e a corretora seguinte é reconhecida sozinha.
 */
export function HoldingsImport() {
  const [previewState, previewAction] = useFormState(previewHoldingsAction, empty);
  const [commitState, commitAction] = useFormState(commitHoldingsAction, empty);
  const preview = previewState.preview;

  if (commitState.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[15px] font-medium text-credit">{commitState.message}</p>
        <p className="mt-1 text-sm text-fg-muted">
          Podes ajustar os preços atuais em Ativos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={previewAction} className="card space-y-4 p-6">
        <div>
          <h2 className="label">1. Ficheiro da corretora</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Extrato de posições em Excel ou CSV. Lemos o que tens, quantas
            unidades e a que preço. Nada é gravado antes de confirmares.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="hold-file">Ficheiro</label>
          <input
            id="hold-file"
            name="file"
            type="file"
            required
            accept=".xlsx,.xls,.csv,.txt,.tsv"
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel2 file:px-3 file:py-2 file:text-sm file:text-fg hover:file:bg-panel2/70"
          />
        </div>

        {previewState.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {previewState.error}
          </p>
        ) : null}

        {/* O painel aparece tanto quando a deteção falha como quando ela
            acerta mal, que é o caso mais comum e o que antes não tinha saída.
            Fica dentro deste formulário de propósito: o ficheiro continua
            escolhido, e corrigir uma coluna é carregar outra vez no botão. */}
        {previewState.sample ? (
          <ManualPanel sample={previewState.sample} fileName={previewState.sample.fileName} />
        ) : preview ? (
          <ManualPanel
            sample={{ fileName: preview.fileName, rows: preview.sample }}
            fileName={preview.fileName}
            current={preview.mapping}
            correcting
          />
        ) : null}

        <PreviewButton hasPreview={Boolean(preview)} />
      </form>

      {preview ? <Confirm preview={preview} action={commitAction} state={commitState} /> : null}
    </div>
  );
}

function ManualPanel({
  sample,
  fileName,
  current,
  correcting,
}: {
  sample: { fileName: string; rows: string[][] };
  fileName: string;
  current?: Record<string, number> | null;
  correcting?: boolean;
}) {
  const width = sample.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const [headerRow, setHeaderRow] = useState(current?.headerRow ?? 0);
  // Sem coluna atribuída, a deteção guarda -1. No formulário isso é "não vem".
  const pick = (k: string) => {
    const v = current?.[k];
    return v === undefined || v === null || v < 0 ? "" : String(v);
  };

  const options = Array.from({ length: width }, (_, i) => {
    const label = (sample.rows[headerRow]?.[i] ?? "").trim();
    return (
      <option key={i} value={i}>
        {label ? `${i + 1}. ${label}` : `Coluna ${i + 1}`}
      </option>
    );
  });

  return (
    <div className="space-y-4 rounded-xl border border-hair bg-panel2/40 p-4">
      <input type="hidden" name="manual" value="1" />
      <div>
        <h3 className="label">{correcting ? "Corrigir as colunas" : "Ensinar esta corretora"}</h3>
        <p className="text-sm text-fg-muted">
          {correcting ? (
            <>
              Se alguma coluna acima saiu trocada, aponta-a aqui e carrega outra
              vez em ler. O ficheiro <span className="text-fg">{fileName}</span> continua escolhido.
            </>
          ) : (
            <>
              Não conheço o formato de <span className="text-fg">{fileName}</span>. Diz-me onde
              estão o ativo e a quantidade. Depois de confirmares, fica aprendido para
              toda a gente.
            </>
          )}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <tbody>
            {sample.rows.map((row, r) => (
              <tr key={r} className={`border-t border-hair2 ${r === headerRow ? "bg-panel2 text-fg" : "text-fg-muted"}`}>
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
                  <td key={c} className="max-w-[9rem] truncate px-2 py-1">{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="h-name">Coluna do ativo</label>
          <select id="h-name" name="nameCol" className="select" defaultValue={pick("nameCol")} key={`nameCol:${pick("nameCol")}`}>
            <option value="">Escolher…</option>
            {options}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="h-qty">Coluna da quantidade</label>
          <select id="h-qty" name="quantityCol" className="select" defaultValue={pick("quantityCol")} key={`quantityCol:${pick("quantityCol")}`}>
            <option value="">Escolher…</option>
            {options}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="h-cost">Preço de compra (opcional)</label>
          <select id="h-cost" name="unitCostCol" className="select" defaultValue={pick("unitCostCol")} key={`unitCostCol:${pick("unitCostCol")}`}>
            <option value="">Não vem no ficheiro</option>
            {options}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="h-price">Preço atual (opcional)</label>
          <select id="h-price" name="unitPriceCol" className="select" defaultValue={pick("unitPriceCol")} key={`unitPriceCol:${pick("unitPriceCol")}`}>
            <option value="">Não vem no ficheiro</option>
            {options}
          </select>
        </div>
      </div>
    </div>
  );
}

function Confirm({
  preview,
  action,
  state,
}: {
  preview: NonNullable<HoldingsState["preview"]>;
  action: (fd: FormData) => void;
  state: HoldingsState;
}) {
  const [rows, setRows] = useState(preview.rows.map(() => true));
  const [label, setLabel] = useState("");
  const canSave = preview.manualMapping && Boolean(preview.fingerprint);

  const payload = {
    rows: preview.rows.filter((_, i) => rows[i]),
    saveTemplate:
      canSave && label.trim()
        ? {
            fingerprint: preview.fingerprint!,
            label: label.trim(),
            header: preview.header,
            mapping: preview.mapping!,
          }
        : null,
  };

  return (
    <form action={action} className="card space-y-5 p-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div>
        <h2 className="label">2. Rever e confirmar</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {preview.rows.length} posição(ões) em {preview.fileName}.
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
          {preview.mappingLabel}
        </p>
        {preview.knownTemplate ? (
          <p className="mt-2 text-xs text-credit">
            Formato conhecido: <span className="font-medium">{preview.knownTemplate}</span>.
          </p>
        ) : null}
      </div>

      {canSave ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-4">
          <label className="label" htmlFor="tpl-name">Guardar este formato (opcional)</label>
          <input
            id="tpl-name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex.: Degiro, posições"
            className="input max-w-sm"
            maxLength={60}
          />
          <p className="mt-1 text-xs text-fg-faint">
            Guardamos só os nomes das colunas, nunca os teus valores. A próxima
            pessoa com esta corretora não tem de repetir o trabalho.
          </p>
        </div>
      ) : null}

      <ul className="divide-y divide-hair2 rounded-xl border border-hair">
        {preview.rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className={`flex items-center gap-3 p-3 ${rows[i] ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={rows[i]}
              onChange={(e) => setRows((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))}
              className="h-4 w-4 shrink-0 rounded border-hair bg-panel2 accent-fg"
              aria-label={`Importar ${r.name}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{r.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
                {r.quantity} un.
                {r.unitCostCents !== null ? ` a ${formatCents(r.unitCostCents)}` : ", sem preço de compra"}
                {r.unitPriceCents !== null ? `, hoje a ${formatCents(r.unitPriceCents)}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <CommitButton disabled={rows.every((v) => !v)} />
    </form>
  );
}

function PreviewButton({ hasPreview }: { hasPreview: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "A ler…" : hasPreview ? "Ler outro ficheiro" : "Pré-visualizar"}
    </button>
  );
}

function CommitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary">
      {pending ? "A importar…" : "Importar posições"}
    </button>
  );
}
