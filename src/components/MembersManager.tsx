"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateMemberAction,
  deleteMemberAction,
  grantSubmitterAction,
  revokeSubmitterAction,
  type ActionState,
} from "@/app/(app)/actions";

interface MemberOpt {
  id: string;
  name: string;
  email?: string | null;
  linkedUserId?: string | null;
  role?: "full" | "submitter";
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
  const [granting, setGranting] = useState(false);
  const [editState, editAction] = useFormState(updateMemberAction, empty);
  const [delState, delAction] = useFormState(deleteMemberAction, empty);
  const [grantState, grantAction] = useFormState(grantSubmitterAction, empty);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);
  useEffect(() => {
    if (grantState.ok) setGranting(false);
  }, [grantState.ok]);

  const isSubmitter = member.role === "submitter";

  if (editing) {
    return (
      <li className="px-3 py-3">
        <form action={editAction} className="space-y-2">
          <input type="hidden" name="id" value={member.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" required maxLength={80} defaultValue={member.name} className="input" aria-label="Nome" />
            <input name="email" type="email" defaultValue={member.email ?? ""} placeholder="email (opcional)" className="input" aria-label="Email" />
          </div>
          {editState.error ? <p role="alert" className="text-xs text-debt">{editState.error}</p> : null}
          <div className="flex items-center gap-2">
            <SaveButton />
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
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
          {isSubmitter ? (
            <span className="chip border-hair text-fg-muted">submete</span>
          ) : member.linkedUserId ? (
            <span className="chip border-credit/30 text-credit">tem acesso</span>
          ) : null}
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-2.5 text-xs">Editar</button>
          {/* Dar acesso de submissão a um participante sem conta. */}
          {!member.linkedUserId ? (
            <button type="button" onClick={() => setGranting((v) => !v)} className="btn-ghost px-2.5 text-xs">
              Dar acesso
            </button>
          ) : null}
          {isSubmitter ? (
            <form action={revokeSubmitterAction}>
              <input type="hidden" name="memberId" value={member.id} />
              <RevokeButton />
            </form>
          ) : null}
          {canDelete && !member.linkedUserId ? (
            <form action={delAction}>
              <input type="hidden" name="id" value={member.id} />
              <DeleteButton />
            </form>
          ) : null}
        </div>
      </div>

      {granting && !member.linkedUserId ? (
        <form action={grantAction} className="mt-3 rounded-xl border border-hair bg-panel2/40 p-3">
          <input type="hidden" name="memberId" value={member.id} />
          <p className="mb-2 text-xs text-fg-muted">
            Dá acesso de <span className="text-fg">submissão</span> a {member.name}: indica o email com que vai entrar.
            Só pode submeter despesas (que ficam pendentes de aprovação).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input name="email" type="email" required placeholder="email@exemplo.pt" className="input sm:flex-1" />
            <GrantButton />
          </div>
          {grantState.error ? <p role="alert" className="mt-1 text-xs text-debt">{grantState.error}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-secondary text-xs">{pending ? "A guardar…" : "Guardar"}</button>;
}

function GrantButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary shrink-0 text-sm">{pending ? "A dar acesso…" : "Dar acesso"}</button>;
}

function RevokeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost px-2.5 text-xs" title="Revogar acesso">
      {pending ? "…" : "Revogar"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost px-2.5 text-xs text-debt hover:text-debt" title="Eliminar participante" aria-label="Eliminar participante">
      ✕
    </button>
  );
}
