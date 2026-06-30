import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { AddExpenseForm } from "@/components/AddExpenseForm";

export const metadata = { title: "Nova despesa · Finanças" };
export const dynamic = "force-dynamic";

export default async function NovaDespesaPage() {
  const ctx = await getSpaceContext();
  const repo = getRepository();
  const [categories, recent] = await Promise.all([
    repo.listCategories(ctx.space.id),
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  // Descrições já usadas neste ambiente, para sugestão (distintas, mais recentes).
  const descriptions = Array.from(
    new Set(recent.map((e) => e.description.trim()).filter(Boolean)),
  ).slice(0, 50);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/despesas" className="eyebrow transition-colors hover:text-fg">
          ← Despesas
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Nova despesa</h1>
        <p className="mt-1 text-sm text-fg-muted">em {ctx.space.name}</p>
      </div>

      <AddExpenseForm
        categories={categories}
        members={ctx.members.map((m) => ({ id: m.id, name: m.name }))}
        currentMemberId={ctx.viewerMemberId}
        today={today}
        descriptions={descriptions}
      />
    </div>
  );
}
