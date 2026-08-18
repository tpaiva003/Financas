"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateMemberAction,
  deleteMemberAction,
  grantSubmitterAction,
  revokeSubmitterAction,
  cancelMemberInviteAction,
  linkMemberAccountAction,
  type ActionState,
} from "@/app/(app)/actions";

interface MemberOpt {
  id: string;
  name: string;
  email?: string | null;
  linkedUserId?: string | null;
  role?: "full" | "submitter";
}

export interface AccountOpt {
  id: string;
  name: string;
  email: string;
}

export function MembersManager({
  members,
  accounts = [],
  pendingInvites = {},
}: {
  members: MemberOpt[];
  accounts?: AccountOpt[];
  /** Participante → email do convite pendente (ainda por aceitar). */
  pendingInvites?: Record<string, string>;
}) {
  return (
    <ul className="card divide-y divide-hair2 p-2">
      {members.map((m) => (
        <MemberRow
          key={m.id}
          member={m}
          accounts={accounts}
          canDelete={members.length > 1}
          inviteEmail={pendingInvites[m.id] ?? null}
        />
      ))}
    </ul>
  );
}

const empty: ActionState = {};

function MemberRow({
  member,
  accounts,
  canDelete,
  inviteEmail,
}: {
  member: MemberOpt;
  accounts: AccountOpt[];
  canDelete: boolean;
  inviteEmail: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [granting, setGranting] = useState(false);
  const [editState, editAction] = useFormState(updateMemberAction, empty);
  const [delState, delAction] = useFormState(deleteMemberAction, empty);
  const [grantState, grantAction] = useFormState(grantSubmitterAction, empty);
  const [linkState, linkAction] = useFormState(linkMemberAccountAction, empty);

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
            <input key={`name:${member.id}:${member.name}`} name="name" required maxLength={80} defaultValue={member.name} className="input" aria-label="Nome" />
            <input key={`email:${member.id}:${member.email ?? ""}`} name="email" type="email" defaultValue={member.email ?? ""} placeholder="email (opcional)" className="input" aria-label="Email" />
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
            {inviteEmail && !member.linkedUserId ? (
              <p className="truncate text-[11px] text-fg-muted">
                Convite enviado para {inviteEmail}, à espera do aceite.
              </p>
            ) : null}
            {delState.error ? <p role="alert" className="mt-0.5 text-[11px] text-debt">{delState.error}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isSubmitter ? (
            <span className="chip border-hair text-fg-muted">submete</span>
          ) : member.linkedUserId ? (
            <span className="chip border-credit/30 text-credit">tem acesso</span>
          ) : inviteEmail ? (
            <span className="chip border-hair text-fg-muted" title={`Convite enviado para ${inviteEmail}`}>
              convidado
            </span>
          ) : null}
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-2.5 text-xs">Editar</button>
          {/* Dar acesso de submissão a um participante sem conta. Enquanto o
              convite espera pelo aceite, o botão passa a ser cancelá-lo. */}
          {!member.linkedUserId && !inviteEmail ? (
            <button type="button" onClick={() => setGranting((v) => !v)} className="btn-ghost px-2.5 text-xs">
              Dar acesso
            </button>
          ) : null}
          {inviteEmail && !member.linkedUserId ? (
            <form action={cancelMemberInviteAction}>
              <input type="hidden" name="memberId" value={member.id} />
              <CancelInviteButton />
            </form>
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

      {/*
        Conta associada: é o que identifica a MESMA pessoa em vários ambientes.
        Sem isto não é possível transferir saldos entre ambientes.
      */}
      {accounts.length > 0 && member.role !== "submitter" ? (
        <form action={linkAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="memberId" value={member.id} />
          <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint" htmlFor={`acc-${member.id}`}>
            Conta
          </label>
          <select
            id={`acc-${member.id}`}
            name="userId"
            key={`acc:${member.id}:${member.linkedUserId ?? ""}`}
            defaultValue={member.linkedUserId ?? ""}
            className="select h-9 w-auto py-1 text-xs"
          >
            <option value="">Sem conta associada</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
          <LinkButton />
          {linkState.error ? (
            <span role="alert" className="text-[11px] text-debt">{linkState.error}</span>
          ) : null}
          {linkState.ok ? <span className="text-[11px] text-credit">Associada.</span> : null}
        </form>
      ) : null}

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

      {/* A resposta do convite fica visível depois de o formulário fechar: é
          aqui que vive a ligação para passar em mão quando o email não sai. */}
      {grantState.ok && grantState.message ? (
        <p className="mt-2 break-all text-xs text-credit">{grantState.message}</p>
      ) : null}
    </li>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-secondary text-xs">{pending ? "A guardar…" : "Guardar"}</button>;
}

function LinkButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost px-2.5 text-xs">
      {pending ? "…" : "Guardar"}
    </button>
  );
}

function GrantButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary shrink-0 text-sm">{pending ? "A dar acesso…" : "Dar acesso"}</button>;
}

function CancelInviteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost px-2.5 text-xs" title="Cancelar convite">
      {pending ? "…" : "Cancelar convite"}
    </button>
  );
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
