"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  type ActionState,
} from "@/app/(app)/actions";
import type { Category } from "@/lib/data";

const empty: ActionState = {};

export function CategoriesManager({
  custom,
  defaults,
}: {
  custom: Category[];
  defaults: Category[];
}) {
  const [state, formAction] = useFormState(createCategoryAction, empty);

  return (
    <div className="space-y-5">
      {/* Categorias do ambiente (editáveis) */}
      {custom.length > 0 ? (
        <ul className="space-y-2">
          {custom.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">
          Ainda não há categorias próprias deste ambiente. Cria abaixo (ex.: Casamento, Férias).
        </p>
      )}

      {/* Nova categoria */}
      <form action={formAction} className="card space-y-3 p-4">
        <p className="label">Nova categoria</p>
        {state.error ? (
          <p role="alert" className="rounded-lg border border-debt/30 bg-debt/10 px-3 py-2 text-xs text-debt">
            {state.error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label className="w-12 shrink-0">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">Ícone</span>
            <input name="icon" maxLength={4} placeholder="🎉" className="input px-2 text-center" />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">Nome</span>
            <input name="name" required maxLength={40} placeholder="Casamento" className="input" />
          </label>
          <label className="shrink-0">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">Cor</span>
            <input name="color" type="color" defaultValue="#7c3aed" className="h-10 w-12 cursor-pointer rounded-lg border border-hair bg-panel2 p-1" />
          </label>
        </div>
        <AddButton />
      </form>

      {/* Categorias padrão (não editáveis) */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
          Padrão (em todos os ambientes)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {defaults.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-hair px-2.5 py-1 text-xs text-fg-muted"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.icon ? `${c.icon} ` : ""}{c.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <li className="card flex items-end gap-2 p-3">
      <form action={updateCategoryAction} className="flex flex-1 items-end gap-2">
        <input type="hidden" name="id" value={category.id} />
        <input
          name="icon"
          maxLength={4}
          defaultValue={category.icon ?? ""}
          placeholder="—"
          className="input w-12 shrink-0 px-2 text-center"
          aria-label="Ícone"
        />
        <input
          name="name"
          required
          maxLength={40}
          defaultValue={category.name}
          className="input min-w-0 flex-1"
          aria-label="Nome"
        />
        <input
          name="color"
          type="color"
          defaultValue={category.color}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-lg border border-hair bg-panel2 p-1"
          aria-label="Cor"
        />
        <SaveButton />
      </form>
      <form action={deleteCategoryAction}>
        <input type="hidden" name="id" value={category.id} />
        <DeleteButton />
      </form>
    </li>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary w-full text-sm">
      {pending ? "A criar…" : "+ Criar categoria"}
    </button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost shrink-0 px-3 text-xs">
      {pending ? "…" : "Guardar"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost shrink-0 px-3 text-xs text-debt hover:text-debt"
      aria-label="Eliminar categoria"
      title="Eliminar"
    >
      ✕
    </button>
  );
}
