import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { getSpaceReport, type Slice } from "@/lib/services/reports-service";
import { formatCents } from "@/lib/domain";

export const metadata = { title: "Relatórios · Finanças" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const ctx = await getSpaceContext();
  const categories = await getRepository().listCategories();
  const report = await getSpaceReport(ctx.space.id, ctx.viewerMemberId, ctx.members, categories);

  return (
    <div className="space-y-9">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">{ctx.space.name}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Relatórios</h1>
        </div>
        <a href="/api/export" className="btn-secondary">⬇ CSV</a>
      </div>

      <div className="card p-6">
        <p className="eyebrow">Total registado</p>
        <p className="mt-2 font-display text-4xl font-semibold tracking-tight tnum sm:text-5xl">
          {formatCents(report.totalCents)}
        </p>
        <p className="mt-1 text-sm text-fg-muted">{report.count} despesa(s) confirmada(s)</p>
      </div>

      {report.count === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          Ainda não há despesas para relatar.
        </p>
      ) : (
        <>
          <Section title="Por categoria">
            <BarList slices={report.byCategory} />
          </Section>
          <Section title="Quem pagou">
            <BarList slices={report.byPayer} />
          </Section>
          <Section title="Por mês">
            <BarList slices={report.byMonth} />
          </Section>
        </>
      )}

      <Link href="/despesas" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar às despesas
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      <div className="card p-5">{children}</div>
    </section>
  );
}

function BarList({ slices }: { slices: Slice[] }) {
  const max = Math.max(1, ...slices.map((s) => Math.abs(s.amountCents)));
  return (
    <ul className="space-y-3">
      {slices.map((s) => {
        const pct = Math.max(2, (Math.abs(s.amountCents) / max) * 100);
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-fg">{s.label}</span>
              <span className="shrink-0 font-mono tnum text-fg-muted">
                {formatCents(s.amountCents)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: s.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
