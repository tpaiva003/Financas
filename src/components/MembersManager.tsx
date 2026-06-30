"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateMemberAction,
  deleteMemberAction,
  type ActionState,
} from "@/app/(app)/actions";

interface MemberOpt {
  id: string;
  name: string;
  email?: string | null;
  linkedUserId?: string | null;
}

export function MembersManager({ members }: { members: MemberOpt[] }) {
  return (
    <ul className="card divide-y divide-hair2 p-2">
      {members.map((m) => (
        <MemberRow key={m.id} member={m} canDelete={members.length > 1} />
      ))}
    </ul>
  );
}

const empty: ActionState = {};

function MemberRow({ member, canDelete }: { member: MemberOpt; canDelete: boolean }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useFormState(updateMemberAction, empty);
  const [delState, delAction] = useFormState(deleteMemberAction, empty);

  // Fecha o editor quando a gravação foi bem-sucedida.
  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <li className="px-3 py-3">
        <form action={editAction} className="space-y-2">
          <input type="hidden" name="id" value={member.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" required maxLength={80} defaultValue={member.name} className="input" aria-label="Nome" />
            <input name="email" type="email" defaultValue={member.email ?? ""} placeholder="email (opcional)" className="input" aria-label="Email" />
          </div>
          {editState.error ? (
            <p role="alert" className="text-xs text-debt">{editState.error}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <SaveButton />
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs">
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hair font-mono text-[11px] text-fg">
          {member.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] text-fg">{member.name}</p>
          {member.email ? <p className="truncate font-mono text-[11px] text-fg-faint">{member.email}</p> : null}
          {delState.error ? <p role="alert" className="mt-0.5 text-[11px] text-debt">{delState.error}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {member.linkedUserId ? <span className="chip border-credit/30 text-credit">tem acesso</span> : null}
        <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-2.5 text-xs">
          Editar
        </button>
        {canDelete && !member.linkedUserId ? (
          <form action={delAction}>
            <input type="hidden" name="id" value={member.id} />
            <DeleteButton />
          </form>
        ) : null}
      </div>
    </li>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary text-xs">
      {pending ? "A guardar…" : "Guardar"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost px-2.5 text-xs text-debt hover:text-debt"
      title="Eliminar participante"
      aria-label="Eliminar participante"
    >
      ✕
    </button>
  );
}
