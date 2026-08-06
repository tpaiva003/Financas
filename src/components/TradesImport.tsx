"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  previewTradesAction,
  commitTradesAction,
  type TradesState,
} from "@/app/(app)/patrimonio/importar/trade-actions";
import { formatCents, toEurCents } from "@/lib/domain";

const empty: TradesState = {};

/**
 * Importar movimentos de uma corretora.
 *
 * Um ficheiro de transações traz uma linha por operação, com data, e é isso que
 * o torna mais valioso do que uma lista de posições: com as datas dá para saber
 * o que o dinheiro rendeu.
 *
 * A revisão é por produto e não por linha. Um ficheiro destes tem centenas de
 * linhas e uma dúzia de produtos; pedir para conferir 147 caixas era pedir para
 * ninguém conferir nada.
 */
export function TradesImport() {
  const [previewState, previewAction] = useFormState(previewTradesAction, empty);
  const [commitState, commitAction] = useFormState(commitTradesAction, empty);
  const preview = previewState.preview;

  if (commitState.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[15px] font-medium text-credit">{commitState.message}</p>
        <p className="mt-1 text-sm text-fg-muted">
          A posição de cada investimento passa a sair destes movimentos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={previewAction} className="card space-y-4 p-6">
        <div>
          <h2 className="label">1. Ficheiro de movimentos</h2>
          <p className="mt-1 text-sm text-fg-muted">
            O extrato de transações da corretora, em Excel ou CSV. Uma linha por
            compra, venda ou dividendo. Nada é gravado antes de confirmares.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="trade-file">Ficheiro</label>
          <input
            id="trade-file"
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

        {previewState.sample ? (
          <ColumnPanel sample={previewState.sample.rows} fileName={previewState.sample.fileName} />
        ) : preview ? (
          <ColumnPanel
            sample={preview.sample}
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

/**
 * Onde estão as colunas.
 *
 * Aparece tanto quando a deteção falha como quando ela acerta mal, que é o caso
 * mais comum. Fica dentro do formulário do ficheiro de propósito: o ficheiro
 * continua escolhido, e corrigir uma coluna é carregar outra vez no botão.
 */
function ColumnPanel({
  sample,
  fileName,
  current,
  correcting,
}: {
  sample: string[][];
  fileName: string;
  current?: Record<string, number> | null;
  correcting?: boolean;
}) {
  const width = sample.reduce((m, r) => Math.max(m, r.length), 0);
  const [headerRow, setHeaderRow] = useState(current?.headerRow ?? 0);

  const pick = (k: string) => {
    const v = current?.[k];
    return v === undefined || v === null || v < 0 ? "" : String(v);
  };

  const options = Array.from({ length: width }, (_, i) => {
    const label = (sample[headerRow]?.[i] ?? "").trim();
    return (
      <option key={i} value={i}>
        {label ? `${i + 1}. ${label}` : `Coluna ${i + 1}`}
      </option>
    );
  });

  const field = (id: string, name: string, label: string, optional = false) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        className="select"
        key={`${name}:${pick(name)}`}
        defaultValue={pick(name)}
      >
        <option value="">{optional ? "Não vem no ficheiro" : "Escolher…"}</option>
        {options}
      </select>
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-hair bg-panel2/40 p-4">
      <input type="hidden" name="manual" value="1" />
      <div>
        <h3 className="label">{correcting ? "Corrigir as colunas" : "Ensinar este formato"}</h3>
        <p className="text-sm text-fg-muted">
          {correcting ? (
            <>
              Se alguma coluna saiu trocada, aponta-a aqui e carrega outra vez em
              ler. O ficheiro <span className="text-fg">{fileName}</span> continua escolhido.
            </>
          ) : (
            <>
              Não conheço o formato de <span className="text-fg">{fileName}</span>. Diz-me onde
              estão a data, o ativo e a quantidade. Depois de confirmares, fica
              aprendido para quem vier a seguir.
            </>
          )}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <tbody>
            {sample.map((row, r) => (
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
                  <td key={c} className="max-w-[9rem] truncate px-2 py-1">{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field("t-date", "dateCol", "Coluna da data")}
        {field("t-name", "nameCol", "Coluna do ativo")}
        {field("t-qty", "quantityCol", "Coluna da quantidade")}
        {field("t-price", "priceCol", "Preço por unidade", true)}
        {field("t-amount", "amountCol", "Valor da operação", true)}
        {field("t-currency", "currencyCol", "Moeda", true)}
        {field("t-fx", "fxRateCol", "Taxa de câmbio", true)}
        {field("t-kind", "kindCol", "Compra ou venda", true)}
      </div>
      <p className="text-xs text-fg-faint">
        Sem coluna de compra ou venda, o sinal da quantidade decide: negativo é
        venda.
      </p>
    </div>
  );
}

function Confirm({
  preview,
  action,
  state,
}: {
  preview: NonNullable<TradesState["preview"]>;
  action: (fd: FormData) => void;
  state: TradesState;
}) {
  const [chosen, setChosen] = useState(preview.groups.map((g) => g.trades.length > 0));
  const [label, setLabel] = useState("");
  const canSave = preview.manualMapping && Boolean(preview.fingerprint);

  const payload = {
    groups: preview.groups
      .filter((_, i) => chosen[i])
      .map((g) => ({ name: g.name, existingAssetId: g.existingAssetId, trades: g.trades })),
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

  const toImport = preview.groups.reduce(
    (s, g, i) => s + (chosen[i] ? g.trades.length : 0),
    0,
  );

  return (
    <form action={action} className="card space-y-5 p-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div>
        <h2 className="label">2. Rever e confirmar</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {preview.totalRows} movimento(s) em {preview.fileName}, de{" "}
          {preview.groups.length} produto(s).
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
          {preview.mappingLabel}
        </p>
        {preview.knownTemplate ? (
          <p className="mt-2 text-xs text-credit">
            Formato conhecido: <span className="font-medium">{preview.knownTemplate}</span>.
          </p>
        ) : null}
        {preview.totalDuplicates > 0 ? (
          <p className="mt-2 text-xs text-fg-muted">
            {preview.totalDuplicates} já estavam registados e ficam de fora. O
            mesmo ficheiro importado outra vez não duplica nada.
          </p>
        ) : null}
        {preview.missingFx > 0 ? (
          <p className="mt-2 text-xs text-debt">
            {preview.missingFx} movimento(s) em moeda estrangeira sem taxa de
            câmbio no ficheiro. Esses ficam de fora: gravá-los como se fossem
            euros dava um valor errado. Podes registá-los à mão com a taxa.
          </p>
        ) : null}
      </div>

      {canSave ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-4">
          <label className="label" htmlFor="tpl-trades">Guardar este formato (opcional)</label>
          <input
            id="tpl-trades"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex.: Degiro, transações"
            className="input max-w-sm"
            maxLength={60}
          />
          <p className="mt-1 text-xs text-fg-faint">
            Guardamos só os nomes das colunas, nunca os teus valores.
          </p>
        </div>
      ) : null}

      <ul className="divide-y divide-hair2 rounded-xl border border-hair">
        {preview.groups.map((g, i) => {
          const compras = g.trades.filter((t) => t.kind === "compra").length;
          const vendas = g.trades.filter((t) => t.kind === "venda").length;
          const outros = g.trades.length - compras - vendas;
          // Em euros, como vai ficar gravado. Os valores do ficheiro estão na
          // moeda de cada linha, e somá-los sem converter dava um total com
          // dólares e euros à mistura, apresentado com o símbolo do euro.
          const investido = g.trades
            .filter((t) => t.kind === "compra")
            .reduce((s, t) => {
              const raw = t.amountCents ?? 0;
              if (!t.currency) return s + raw;
              return s + (t.fxRate ? (toEurCents(raw, t.fxRate) ?? 0) : 0);
            }, 0);
          return (
            <li key={g.name} className={`flex items-start gap-3 p-3 ${chosen[i] ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={chosen[i]}
                disabled={g.trades.length === 0}
                onChange={(e) =>
                  setChosen((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-hair bg-panel2 accent-fg"
                aria-label={`Importar ${g.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{g.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
                  {g.trades.length === 0 ? (
                    "já está tudo registado"
                  ) : (
                    <>
                      {compras > 0 ? `${compras} compra(s)` : ""}
                      {vendas > 0 ? `${compras > 0 ? ", " : ""}${vendas} venda(s)` : ""}
                      {outros > 0 ? `, ${outros} outro(s)` : ""}
                      {investido > 0 ? ` · ${formatCents(investido)}` : ""}
                    </>
                  )}
                  {g.duplicates > 0 ? ` · ${g.duplicates} repetido(s)` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-fg-faint">
                  {g.existingAssetId
                    ? "Junta-se ao investimento que já tens."
                    : "Cria um investimento novo."}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <CommitButton count={toImport} />
    </form>
  );
}

function PreviewButton({ hasPreview }: { hasPreview: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "A ler…" : hasPreview ? "Ler outra vez" : "Pré-visualizar"}
    </button>
  );
}

function CommitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || count === 0} className="btn-primary">
      {pending ? "A importar…" : `Importar ${count} movimento(s)`}
    </button>
  );
}
