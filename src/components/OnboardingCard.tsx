import Link from "next/link";
import type { Onboarding } from "@/lib/domain";
import { dismissOnboardingAction } from "@/app/(app)/actions";

/**
 * Primeiros passos, no ecrã principal.
 *
 * Só aparece enquanto houver coisas por fazer, e sai sozinho quando acabam.
 * Também se pode dispensar: quem já sabe o que anda a fazer não tem de levar
 * com um guia à frente.
 */
export function OnboardingCard({ onboarding }: { onboarding: Onboarding }) {
  if (onboarding.complete) return null;
  const { steps, doneCount, total, next } = onboarding;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Primeiros passos</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight">
            {doneCount === 0
              ? "Vamos pôr isto a andar"
              : `${doneCount} de ${total} feitos`}
          </h2>
        </div>
        <form action={dismissOnboardingAction}>
          <button type="submit" className="btn-ghost text-xs">Dispensar</button>
        </form>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-credit transition-all"
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </div>

      <ul className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${
                s.done ? "bg-credit text-bg" : "border border-hair text-fg-faint"
              }`}
              aria-hidden
            >
              {s.done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.done ? "text-fg-faint line-through" : "text-fg"}`}>
                {s.title}
              </p>
              {!s.done ? (
                <p className="mt-0.5 text-xs text-fg-muted">{s.description}</p>
              ) : null}
            </div>
            {!s.done && next?.id === s.id ? (
              <Link href={s.href} className="btn-secondary shrink-0 text-xs">
                {s.cta}
              </Link>
            ) : !s.done ? (
              <Link href={s.href} className="btn-ghost shrink-0 text-xs">
                {s.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
