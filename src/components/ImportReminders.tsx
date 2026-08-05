import {
  saveImportReminderAction,
  deleteImportReminderAction,
} from "@/app/(app)/actions";
import { FREQUENCY_LABELS, type ReminderState } from "@/lib/domain";
import { IMPORT_SOURCES } from "@/lib/import/types";
import type { SpaceReminders } from "@/lib/services/reminder-service";

const STATE_STYLE: Record<ReminderState, string> = {
  overdue: "border-debt/40 bg-debt/10 text-debt",
  due: "border-fg/30 bg-panel2 text-fg",
  never: "border-hair text-fg-muted",
  ok: "border-credit/30 text-credit",
};

const STATE_LABEL: Record<ReminderState, string> = {
  overdue: "Atrasado",
  due: "Está na hora",
  never: "Por importar",
  ok: "Em dia",
};

function ptDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Lembretes de importação por banco (REQ-IMP-8).
 *
 * Mostra, para cada banco, quando foi a última importação, se já está na hora
 * da próxima e, o mais útil, a partir de que data se deve importar, para não
 * sobrepor o que já está registado.
 */
export function ImportReminders({ spaces }: { spaces: SpaceReminders[] }) {
  const hasAny = spaces.some((s) => s.reminders.length > 0 || s.unconfigured.length > 0);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="eyebrow">Lembretes de importação</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Define de quanto em quanto tempo importas cada banco. A app diz-te
          quando é a próxima e a partir de que dia deves importar.
        </p>
      </div>

      {!hasAny ? (
        <p className="card p-6 text-center text-sm text-fg-muted">
          Ainda não tens lembretes. Assim que importares um extrato, aparece aqui
          a opção de definir a periodicidade.
        </p>
      ) : null}

      {spaces.map((space) => {
        if (space.reminders.length === 0 && space.unconfigured.length === 0) return null;
        return (
          <div key={space.spaceId} className="card space-y-3 p-5">
            <p className="label mb-0">{space.spaceName}</p>

            {space.reminders.map((r) => (
              <div
                key={r.source}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair bg-panel2/40 p-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {r.label || r.source}
                    <span className={`chip ${STATE_STYLE[r.state]}`}>
                      {STATE_LABEL[r.state]}
                      {r.state === "overdue" ? ` · ${r.overdueDays} dia(s)` : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {FREQUENCY_LABELS[r.frequency]}
                    {r.lastImportAt ? ` · última importação a ${ptDate(r.lastImportAt)}` : ""}
                    {r.nextDueDate ? ` · próxima a ${ptDate(r.nextDueDate)}` : ""}
                  </p>
                  {r.fromDate ? (
                    <p className="mt-0.5 text-xs text-fg-faint">
                      Importar a partir de <span className="text-fg-muted">{ptDate(r.fromDate)}</span>.
                      O que vem antes já está registado.
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <form action={saveImportReminderAction} className="flex items-center gap-2">
                    <input type="hidden" name="spaceId" value={space.spaceId} />
                    <input type="hidden" name="source" value={r.source} />
                    <input type="hidden" name="label" value={r.label ?? ""} />
                    <label className="sr-only" htmlFor={`freq-${space.spaceId}-${r.source}`}>
                      Periodicidade de {r.label || r.source}
                    </label>
                    <select
                      id={`freq-${space.spaceId}-${r.source}`}
                      name="frequency"
                      defaultValue={r.frequency}
                      className="select h-9 py-1 text-xs"
                    >
                      {Object.entries(FREQUENCY_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn-ghost text-xs">Guardar</button>
                  </form>
                  <form action={deleteImportReminderAction}>
                    <input type="hidden" name="spaceId" value={space.spaceId} />
                    <input type="hidden" name="source" value={r.source} />
                    <button type="submit" className="btn-ghost px-2.5 text-xs text-debt hover:text-debt">
                      Remover
                    </button>
                  </form>
                </div>
              </div>
            ))}

            {/* Bancos já importados que ainda não têm periodicidade definida. */}
            {space.unconfigured.map((u) => (
              <form
                key={u.source}
                action={saveImportReminderAction}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-hair p-3"
              >
                <input type="hidden" name="spaceId" value={space.spaceId} />
                <input type="hidden" name="source" value={u.source} />
                <div>
                  <p className="text-sm text-fg">{u.label}</p>
                  <p className="mt-0.5 text-xs text-fg-faint">
                    Importado a {ptDate(u.lastImportAt)} · sem lembrete
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`new-freq-${space.spaceId}-${u.source}`}>
                    Periodicidade de {u.label}
                  </label>
                  <select
                    id={`new-freq-${space.spaceId}-${u.source}`}
                    name="frequency"
                    defaultValue="monthly"
                    className="select h-9 py-1 text-xs"
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary text-xs">Lembrar-me</button>
                </div>
              </form>
            ))}
          </div>
        );
      })}

      {/* Criar um lembrete para um banco ainda não importado. */}
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium text-fg">
          Criar lembrete para outro banco
        </summary>
        <form action={saveImportReminderAction} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="rem-space">Ambiente</label>
            <select id="rem-space" name="spaceId" className="select">
              {spaces.map((s) => (
                <option key={s.spaceId} value={s.spaceId}>{s.spaceName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rem-source">Banco</label>
            <select id="rem-source" name="source" className="select">
              {IMPORT_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rem-freq">Periodicidade</label>
            <select id="rem-freq" name="frequency" defaultValue="monthly" className="select">
              {Object.entries(FREQUENCY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn-secondary text-sm">Criar lembrete</button>
          </div>
        </form>
      </details>
    </section>
  );
}
