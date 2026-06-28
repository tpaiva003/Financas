import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getRepository } from "@/lib/data";
import { householdUsers } from "@/lib/users";
import { AddExpenseForm } from "@/components/AddExpenseForm";

export const metadata = { title: "Nova despesa — Finanças" };
export const dynamic = "force-dynamic";

export default async function NovaDespesaPage() {
  const user = await requireUser();
  const categories = await getRepository().listCategories();
  const users = householdUsers();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/despesas" className="eyebrow transition-colors hover:text-fg">
          ← Despesas
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Nova despesa</h1>
      </div>

      <AddExpenseForm
        categories={categories}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        currentUserId={user.id}
        today={today}
      />
    </div>
  );
}
