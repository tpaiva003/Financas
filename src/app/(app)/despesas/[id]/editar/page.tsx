import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { EditExpenseForm } from "@/components/EditExpenseForm";

export const metadata = { title: "Editar despesa · Finanças" };
export const dynamic = "force-dynamic";

export default async function EditarDespesaPage({ params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const repo = getRepository();
  const expense = await repo.getExpense(params.id, ctx.viewerMemberId);
  if (!expense) redirect("/despesas");

  const categories = await repo.listCategories(ctx.space.id);
  const memberIds = ctx.fullMembers.map((m) => m.id);

  // Deteta divisão "só de um(a)": PERCENT em que um membro tem 100% e os restantes 0%.
  let splitType: "EQUAL" | "PERCENT" | "SOLE" = expense.split.type === "PERCENT" ? "PERCENT" : "EQUAL";
  let soleId = memberIds[0] ?? "";
  if (expense.split.type === "PERCENT") {
    const weights = expense.split.weights ?? {};
    const at100 = memberIds.filter((id) => (weights[id] ?? 0) === 100);
    const rest = memberIds.filter((id) => (weights[id] ?? 0) !== 100);
    if (at100.length === 1 && rest.every((id) => (weights[id] ?? 0) === 0)) {
      splitType = "SOLE";
      soleId = at100[0]!;
    }
  }

  const percentA =
    expense.split.type === "PERCENT"
      ? (expense.split.weights?.[ctx.fullMembers[0]?.id ?? ""] ?? 50)
      : 50;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/despesas" className="eyebrow transition-colors hover:text-fg">
          ← Despesas
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Editar despesa</h1>
        <p className="mt-1 text-sm text-fg-muted">em {ctx.space.name}</p>
      </div>

      <EditExpenseForm
        id={expense.id}
        hasReceipt={Boolean(expense.receiptPath)}
        categories={categories}
        members={ctx.fullMembers.map((m) => ({ id: m.id, name: m.name }))}
        initial={{
          description: expense.description,
          amount: (expense.amountCents / 100).toString().replace(".", ","),
          transactionDate: expense.transactionDate,
          categoryId: expense.categoryId ?? "",
          payerId: expense.payerId,
          kind: expense.kind,
          splitType,
          soleId,
          percentA,
          visibleToPartner: expense.visibleToPartner ?? false,
        }}
      />
    </div>
  );
}
