"use client";

import { useFormStatus } from "react-dom";
import {
  settleAndPayAction,
  carryBalanceAction,
  reopenPeriodAction,
} from "@/app/(app)/actions";

export function ClosePeriodPanel({
  hasBalance,
  balanceLabel,
  openCount,
  settledCount,
}: {
  hasBalance: boolean;
  balanceLabel: string;
  openCount: number;
  settledCount: number;
}) {
  if (openCount === 0 && settledCount === 0) return null;

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="label">Fechar período</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Fecha as despesas abertas para reduzir o ruído visual. O saldo
          continua explicável e podes reabrir a qualquer momento.
        </p>
      </div>

      {openCount > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <ConfirmForm
            action={settleAndPayAction}
            confirm={`Registar o pagamento sugerido (${balanceLabel}) e colapsar ${openCount} despesa(s)?`}
            disabled={!hasBalance}
            variant="primary"
            label="Registar pagamento e fechar"
            hint={hasBalance ? balanceLabel : "Nada a pagar"}
          />
          <ConfirmForm
            action={carryBalanceAction}
            confirm={`Transitar o saldo para o próximo período e colapsar ${openCount} despesa(s)? Não regista pagamento.`}
            variant="secondary"
            label="Transitar saldo"
            hint="Sem pagamento — o saldo segue"
          />
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Não há despesas abertas para fechar.</p>
      )}

      {settledCount > 0 ? (
        <ConfirmForm
          action={reopenPeriodAction}
          confirm={`Reabrir as ${settledCount} despesa(s) liquidadas deste ambiente?`}
          variant="ghost"
          label={`Reabrir período (${settledCount} liquidada${settledCount === 1 ? "" : "s"})`}
        />
      ) : null}
    </section>
  );
}

function ConfirmForm({
  action,
  confirm,
  label,
  hint,
  variant,
  disabled,
}: {
  action: () => Promise<void>;
  confirm: string;
  label: string;
  hint?: string;
  variant: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <SubmitBtn variant={variant} label={label} hint={hint} disabled={disabled} />
    </form>
  );
}

function SubmitBtn({
  variant,
  label,
  hint,
  disabled,
}: {
  variant: "primary" | "secondary" | "ghost";
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const cls =
    variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "btn-ghost";
  return (
    <button type="submit" disabled={disabled || pending} className={`${cls} w-full flex-col py-3`}>
      <span>{pending ? "A processar…" : label}</span>
      {hint ? <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-70">{hint}</span> : null}
    </button>
  );
}
