"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  previewBrokerAction,
  commitBrokerAction,
  type BrokerState,
} from "@/app/(app)/patrimonio/importar/actions";
import type { BrokerFilePreview } from "@/lib/services/broker-import";
import { formatCents, toEurCents } from "@/lib/domain";

const empty: BrokerState = {};

/**
 * Importar da corretora.
 *
 * Um sítio só, e vários ficheiros de uma vez. Antes havia dois separadores,
 * "Movimentos" e "Posições", e a pessoa tinha de saber qual dos dois tinha na
 * mão. Não tem de saber: **a diferença lê-se no ficheiro**. Um extrato de
 * transações traz datas a sério, uma lista de posições não. Pede-se só "o
 * ficheiro da corretora" e diz-se depois o que se percebeu que ele é.
 *
 * Vários de uma vez porque é assim que eles vêm: um por ano, ou um por conta. E
 * um que falhe não estraga os outros.
 */
export function BrokerImport() {
  const [previewState, previewAction] = useFormState(previewBrokerAction, empty);
  const [commitState, commitAction] = useFormState(commitBrokerAction, empty);
  const preview = previewState.preview;

  if (commitState.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[15px] font-medium text-credit">{commitState.message}</p>
        <p className="mt-1 text-sm text-fg-muted">
          Onde há movimentos, a posição passa a sair deles.
        </p>
      </div>
    );
  }

  // O painel de colunas só faz sentido com um ficheiro: é para ensinar um
  // formato, e ensinar dois ao mesmo tempo não se percebe.
  const porReconhecer = preview?.files.filter((f) => !f.kind) ?? [];
  const podeCorrigir = preview?.files.length === 1;

  return (
    <div className="space-y-6">
      <form action={previewAction} className="card space-y-4 p-6">
        <div>
          <h2 className="label">1. Ficheiros da corretora</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Extratos de transações ou listas de posições, em Excel ou CSV. Podes
            escolher vários de uma vez, e percebemos o que cada um é. Nada é
            gravado antes de confirmares.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="broker-files">Ficheiros</label>
          <input
            id="broker-files"
            name="files"
            type="file"
            multiple
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

        {podeCorrigir && preview ? (
          <ColumnPanel file={preview.files[0]!} />
        ) : porReconhecer.length > 0 ? (
          <p className="rounded-xl border border-hair bg-panel2/40 p-4 text-sm text-fg-muted">
            {porReconhecer.length} ficheiro(s) por reconhecer. Carrega só esse
            ficheiro para poderes apontar as colunas à mão.
          </p>
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
 *
 * **Indicar a coluna da data é o que decide o tipo.** Com data é um extrato de
 * movimentos, sem data é uma lista de posições. É a mesma regra da deteção
 * automática, e não fazia sentido serem duas.
 */
function ColumnPanel({ file }: { file: BrokerFilePreview }) {
  const width = file.sample.reduce((m, r) => Math.max(m, r.length), 0);
  const [headerRow, setHeaderRow] = useState(file.mapping?.headerRow ?? 0);

  const pick = (k: string) => {
    const v = file.mapping?.[k];
    return v === undefined || v === null || v < 0 ? "" : String(v);
  };

  const options = Array.from({ length: width }, (_, i) => {
    const label = (file.sample[headerRow]?.[i] ?? "").trim();
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
        <h3 className="label">{file.kind ? "Corrigir as colunas" : "Ensinar este formato"}</h3>
        <p className="text-sm text-fg-muted">
          {file.kind ? (
            <>
              Se alguma coluna saiu trocada, aponta-a aqui e carrega outra vez em
              ler. O ficheiro <span className="text-fg">{file.fileName}</span> continua escolhido.
            </>
          ) : (
            <>
              Não conheço o formato de <span className="text-fg">{file.fileName}</span>. Diz-me
              onde estão o ativo e a quantidade. Depois de confirmares, fica
              aprendido para quem vier a seguir.
            </>
          )}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <tbody>
            {file.sample.map((row, r) => (
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
        {field("t-name", "nameCol", "Coluna do ativo")}
        {field("t-qty", "quantityCol", "Coluna da quantidade")}
        {field("t-date", "dateCol", "Coluna da data", true)}
        {field("t-price", "priceCol", "Preço por unidade", true)}
        {field("t-amount", "amountCol", "Valor da operação", true)}
        {field("t-cost", "unitCostCol", "Preço de compra", true)}
        {field("t-currency", "currencyCol", "Moeda", true)}
        {field("t-fx", "fxRateCol", "Taxa de câmbio", true)}
        {field("t-kind", "kindCol", "Compra ou venda", true)}
      </div>
      <p className="text-xs text-fg-faint">
        A <span className="text-fg-muted">data</span> é o que distingue os dois
        tipos de ficheiro: com ela é um extrato de movimentos, sem ela é uma
        lista de posições. Sem coluna de compra ou venda, o sinal da quantidade
        decide: negativo é venda.
      </p>
    </div>
  );
}

function Confirm({
  preview,
  action,
  state,
}: {
  preview: NonNullable<BrokerState["preview"]>;
  action: (fd: FormData) => void;
  state: BrokerState;
}) {
  // Uma escolha por ficheiro: com dez ficheiros e centenas de linhas, escolher
  // linha a linha era pedir para ninguém escolher nada.
  const [chosen, setChosen] = useState(
    preview.files.map((f) => f.groups.length > 0 || f.holdings.length > 0),
  );
  const [label, setLabel] = useState("");

  // Só se aprende um formato de cada vez, e só quando ele foi apontado à mão.
  const ensinavel = preview.files.length === 1 && preview.files[0]!.fingerprint;

  const escolhidos = preview.files.filter((_, i) => chosen[i]);
  const payload = {
    groups: escolhidos.flatMap((f) => f.groups),
    holdings: escolhidos.flatMap((f) => f.holdings),
    saveTemplate:
      ensinavel && label.trim()
        ? {
            fingerprint: preview.files[0]!.fingerprint!,
            label: label.trim(),
            header: preview.files[0]!.header,
            mapping: preview.files[0]!.mapping!,
          }
        : null,
  };

  const totalMovimentos = payload.groups.reduce((s, g) => s + g.trades.length, 0);
  const totalPosicoes = payload.holdings.length;

  return (
    <form action={action} className="card space-y-5 p-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div>
        <h2 className="label">2. Rever e confirmar</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {preview.files.length} ficheiro(s): {preview.totalNewTrades} movimento(s) novo(s)
          {preview.totalHoldings > 0 ? `, ${preview.totalHoldings} posição(ões)` : ""}.
        </p>
        {preview.totalDuplicates > 0 ? (
          <p className="mt-1 text-xs text-fg-muted">
            {preview.totalDuplicates} já estavam registados e ficam de fora. O
            mesmo ficheiro importado outra vez não duplica nada.
          </p>
        ) : null}
      </div>

      {ensinavel ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-4">
          <label className="label" htmlFor="tpl-broker">Guardar este formato (opcional)</label>
          <input
            id="tpl-broker"
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

      <ul className="space-y-3">
        {preview.files.map((f, i) => (
          <FileCard
            key={f.fileName + i}
            file={f}
            chosen={chosen[i]!}
            onToggle={(v) => setChosen((prev) => prev.map((x, idx) => (idx === i ? v : x)))}
          />
        ))}
      </ul>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <CommitButton movimentos={totalMovimentos} posicoes={totalPosicoes} />
    </form>
  );
}

function FileCard({
  file,
  chosen,
  onToggle,
}: {
  file: BrokerFilePreview;
  chosen: boolean;
  onToggle: (v: boolean) => void;
}) {
  const nada = file.groups.length === 0 && file.holdings.length === 0;

  return (
    <li className={`rounded-xl border border-hair p-4 ${chosen ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={chosen}
          disabled={nada}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-hair bg-panel2 accent-fg"
          aria-label={`Importar ${file.fileName}`}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
            {file.fileName}
            {file.kind ? (
              <span className="chip border-hair text-fg-faint">
                {file.kind === "movimentos" ? "movimentos" : "posições"}
              </span>
            ) : null}
          </p>

          {file.problem ? (
            <p className="mt-1 text-xs text-debt">{file.problem}</p>
          ) : (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
              {file.mappingLabel}
            </p>
          )}

          {file.missingFx > 0 ? (
            <p className="mt-1 text-xs text-debt">
              {file.missingFx} movimento(s) em moeda estrangeira sem taxa de
              câmbio. Ficam de fora: gravá-los como euros dava um valor errado.
            </p>
          ) : null}

          {file.groups.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {file.groups.map((g) => {
                const compras = g.trades.filter((t) => t.kind === "compra").length;
                const vendas = g.trades.filter((t) => t.kind === "venda").length;
                const investido = g.trades
                  .filter((t) => t.kind === "compra")
                  .reduce((s, t) => {
                    const raw = t.amountCents ?? 0;
                    if (!t.currency) return s + raw;
                    return s + (t.fxRate ? (toEurCents(raw, t.fxRate) ?? 0) : 0);
                  }, 0);
                return (
                  <li key={g.name} className="text-xs text-fg-muted">
                    <span className="text-fg">{g.name}</span>
                    <span className="font-mono text-fg-faint">
                      {" · "}
                      {compras > 0 ? `${compras} compra(s)` : ""}
                      {vendas > 0 ? `${compras > 0 ? ", " : ""}${vendas} venda(s)` : ""}
                      {investido > 0 ? ` · ${formatCents(investido)}` : ""}
                      {g.duplicates > 0 ? ` · ${g.duplicates} repetido(s)` : ""}
                    </span>
                    <span className="text-fg-faint">
                      {g.existingAssetId ? " · junta-se ao que já tens" : " · investimento novo"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {file.holdings.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {file.holdings.slice(0, 12).map((h, i) => (
                <li key={`${h.name}-${i}`} className="text-xs text-fg-muted">
                  <span className="text-fg">{h.name}</span>
                  <span className="font-mono text-fg-faint">
                    {" · "}
                    {h.quantity} un.
                    {h.unitPriceCents !== null ? `, hoje a ${formatCents(h.unitPriceCents)}` : ""}
                  </span>
                </li>
              ))}
              {file.holdings.length > 12 ? (
                <li className="text-xs text-fg-faint">
                  e mais {file.holdings.length - 12}.
                </li>
              ) : null}
            </ul>
          ) : null}

          {nada && !file.problem ? (
            <p className="mt-1 text-xs text-fg-faint">Já está tudo registado.</p>
          ) : null}
        </div>
      </div>
    </li>
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

function CommitButton({ movimentos, posicoes }: { movimentos: number; posicoes: number }) {
  const { pending } = useFormStatus();
  const total = movimentos + posicoes;
  const texto = [
    movimentos > 0 ? `${movimentos} movimento(s)` : null,
    posicoes > 0 ? `${posicoes} posição(ões)` : null,
  ]
    .filter(Boolean)
    .join(" e ");

  return (
    <button type="submit" disabled={pending || total === 0} className="btn-primary">
      {pending ? "A importar…" : total === 0 ? "Nada para importar" : `Importar ${texto}`}
    </button>
  );
}
