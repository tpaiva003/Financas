import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { generateDueRecurring } from "@/lib/services/recurring-service";
import { formatCents, frequencyLabel } from "@/lib/domain";
import { AddRecurringForm } from "@/components/AddRecurringForm";
import { RecurringTemplates, type TemplateItem } from "@/components/RecurringTemplates";
import { PendingRecurring, type PendingItem } from "@/components/PendingRecurring";

export const metadata = { title: "Recorrentes · Rachar" };
export const dynamic = "force-dynamic";

export default async function RecorrentesPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  // Materialização preguiçosa: gera as ocorrências em atraso (idempotente).
  await generateDueRecurring(ctx.space.id);

  const repo = getRepository();
  const [templates, categories, expenses] = await Promise.all([
    repo.listRecurring(ctx.space.id),
    repo.listCategories(ctx.space.id),
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
  ]);

  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;
  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? "Sem categoria";
  const today = new Date().toISOString().slice(0, 10);

  const pending: PendingItem[] = expenses
    .filter((e) => e.origin === "recurring" && e.status === "pending")
    .map((e) => ({
      id: e.id,
      description: e.description,
      date: e.transactionDate,
      categoryName: catName(e.categoryId),
      payerName: nameOf(e.payerId),
      estimate: e.amountCents > 0 ? (e.amountCents / 100).toFixed(2).replace(".", ",") : "",
    }));

  const items: TemplateItem[] = templates.map((t) => ({
    id: t.id,
    description: t.description,
    amountLabel: t.valueType === "variable"
      ? (t.amountCents ? `~${formatCents(t.amountCents)}` : "Variável")
      : formatCents(t.amountCents ?? 0),
    valueType: t.valueType,
    frequencyLabel: frequencyLabel(t.frequency),
    nextDate: t.nextDate,
    endDate: t.endDate,
    status: t.status,
    payerName: nameOf(t.payerId),
    categoryName: catName(t.categoryId),
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Recorrentes</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Renda, luz, água e outras despesas que se repetem. As de valor variável
          ficam por confirmar antes de entrarem no saldo.
        </p>
      </div>

      <PendingRecurring items={pending} />

      <section>
        <h2 className="eyebrow mb-2">Templates ({templates.length})</h2>
        <RecurringTemplates items={items} />
      </section>

      <section className="card p-6">
        <h2 className="label">Nova recorrente</h2>
        <div className="mt-3">
          <AddRecurringForm
            categories={categories}
            members={ctx.members.map((m) => ({ id: m.id, name: m.name }))}
            currentMemberId={ctx.viewerMemberId}
            today={today}
          />
        </div>
      </section>
    </div>
  );
}
