"use client";

import { useState } from "react";
import { recurringOpAction } from "@/app/(app)/actions";
import { EditRecurringForm, type RecurringEditInitial } from "@/components/EditRecurringForm";

interface Opt {
  id: string;
  name: string;
  icon?: string;
}

export interface TemplateItem {
  id: string;
  description: string;
  amountLabel: string;
  valueType: "fixed" | "variable";
  frequencyLabel: string;
  nextDate: string;
  endDate?: string | null;
  status: "active" | "paused";
  payerName: string;
  categoryName: string;
  /** Valores crus para pré-preencher a edição. */
  edit: RecurringEditInitial;
}

export function RecurringTemplates({
  items,
  categories,
  members,
}: {
  items: TemplateItem[];
  categories: Opt[];
  members: Opt[];
}) {
  if (items.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-fg-muted">
        Ainda não há recorrentes. Cria uma abaixo (ex.: renda, luz, água).
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <TemplateRow key={t.id} t={t} categories={categories} members={members} />
      ))}
    </ul>
  );
}

function TemplateRow({
  t,
  categories,
  members,
}: {
  t: TemplateItem;
  categories: Opt[];
  members: Opt[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className={`card p-4 ${t.status === "paused" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-fg">
            {t.description}
            {t.status === "paused" ? <span className="ml-2 chip border-hair text-fg-faint">Em pausa</span> : null}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {t.amountLabel} · {t.frequencyLabel} · próxima {new Date(t.nextDate).toLocaleDateString("pt-PT")}
            {t.endDate ? ` · até ${new Date(t.endDate).toLocaleDateString("pt-PT")}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {t.categoryName} · paga {t.payerName} · {t.valueType === "variable" ? "valor variável" : "valor fixo"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setEditing((v) => !v)} className="btn-ghost px-2.5 text-xs">
          {editing ? "Fechar edição" : "Editar"}
        </button>
        {t.status === "active" ? (
          <OpButton id={t.id} op="pause" label="Pausar" />
        ) : (
          <OpButton id={t.id} op="resume" label="Retomar" />
        )}
        <OpButton id={t.id} op="skip" label="Saltar próxima" confirm="Saltar a próxima ocorrência desta recorrente?" />
        <OpButton id={t.id} op="end" label="Terminar" confirm="Terminar esta recorrente? Deixa de gerar despesas." />
        <OpButton id={t.id} op="delete" label="Eliminar" danger confirm="Eliminar esta recorrente? As despesas já geradas mantêm-se." />
      </div>

      {editing ? (
        <EditRecurringForm
          id={t.id}
          categories={categories}
          members={members}
          initial={t.edit}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}

function OpButton({
  id,
  op,
  label,
  confirm,
  danger,
}: {
  id: string;
  op: string;
  label: string;
  confirm?: string;
  danger?: boolean;
}) {
  return (
    <form
      action={recurringOpAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button
        type="submit"
        className={`btn-ghost px-2.5 text-xs ${danger ? "text-debt hover:text-debt" : ""}`}
      >
        {label}
      </button>
    </form>
  );
}
