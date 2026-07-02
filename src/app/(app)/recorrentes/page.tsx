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

  // A divisão é sempre entre os participantes plenos.
  const fullMemberIds = ctx.fullMembers.map((m) => m.id);

  const items: TemplateItem[] = templates.map((t) => {
    // Deteta o tipo de divisão para pré-preencher a edição
    // (PERCENT com um membro a 100% e os restantes a 0% = "só de um(a)").
    let splitType: "EQUAL" | "PERCENT" | "SOLE" = t.split.type === "PERCENT" ? "PERCENT" : "EQUAL";
    let soleId = fullMemberIds[0] ?? "";
    if (t.split.type === "PERCENT") {
      const weights = t.split.weights ?? {};
      const at100 = fullMemberIds.filter((id) => (weights[id] ?? 0) === 100);
      const rest = fullMemberIds.filter((id) => (weights[id] ?? 0) !== 100);
      if (at100.length === 1 && rest.every((id) => (weights[id] ?? 0) === 0)) {
        splitType = "SOLE";
        soleId = at100[0]!;
      }
    }
    const percentA =
      t.split.type === "PERCENT" ? (t.split.weights?.[fullMemberIds[0] ?? ""] ?? 50) : 50;

    return {
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
      edit: {
        description: t.description,
        amount: t.amountCents ? (t.amountCents / 100).toFixed(2).replace(".", ",") : "",
        valueType: t.valueType,
        frequency: t.frequency,
        nextDate: t.nextDate,
        endDate: t.endDate ?? "",
        categoryId: t.categoryId ?? "",
        payerId: t.payerId,
        splitType,
        percentA,
        soleId,
      },
    };
  });

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
        <RecurringTemplates
          items={items}
          categories={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
          members={ctx.fullMembers.map((m) => ({ id: m.id, name: m.name }))}
        />
      </section>

      <section className="card p-6">
        <h2 className="label">Nova recorrente</h2>
        <div className="mt-3">
          <AddRecurringForm
            categories={categories}
            members={ctx.fullMembers.map((m) => ({ id: m.id, name: m.name }))}
            currentMemberId={ctx.viewerMemberId}
            today={today}
          />
        </div>
      </section>
    </div>
  );
}
