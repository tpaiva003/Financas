import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { ImportWizard } from "@/components/ImportWizard";
import { undoImportBatchAction } from "@/app/(app)/actions";
import { IMPORT_SOURCES } from "@/lib/import/types";

export const metadata = { title: "Importar extrato · Rachar" };
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  const [categories, batches] = await Promise.all([
    repo.listCategories(ctx.space.id),
    // A tabela pode ainda não existir se a migração não estiver aplicada.
    repo.listImportBatches(ctx.space.id).catch(() => []),
  ]);

  const sourceLabel = (id: string) =>
    IMPORT_SOURCES.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Importar extrato</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Põe semanas em dia de uma vez: carrega o extrato do banco (Excel/CSV)
          ou do cartão Universo (PDF), revê o que entra e importa. Transações já
          registadas são detetadas e não duplicam.
        </p>
        <p className="mt-2 text-xs text-fg-faint">
          Cartão de crédito: o extrato do cartão traz as compras uma a uma e o
          pagamento do cartão como entrada. Se importares também o extrato do
          banco, o débito direto do cartão e esse pagamento anulam-se, ficando só
          as compras. Podes sempre desligar linhas na pré-visualização.
        </p>
      </div>

      <ImportWizard
        categories={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
        members={ctx.fullMembers.map((m) => ({ id: m.id, name: m.name }))}
        currentMemberId={ctx.viewerMemberId}
      />

      <section>
        <h2 className="eyebrow mb-2">Importações anteriores</h2>
        {batches.length === 0 ? (
          <p className="card p-6 text-center text-sm text-fg-muted">
            Ainda não importaste nenhum extrato.
          </p>
        ) : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <li key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {b.fileName || sourceLabel(b.source)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    {new Date(b.createdAt).toLocaleDateString("pt-PT")} · {sourceLabel(b.source)} ·{" "}
                    {b.importedCount} importada(s)
                    {b.duplicateCount > 0 ? ` · ${b.duplicateCount} ignorada(s)` : ""}
                  </p>
                </div>
                <form action={undoImportBatchAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="btn-ghost px-2.5 text-xs text-debt hover:text-debt">
                    Anular lote
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/despesas" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar às despesas
      </Link>
    </div>
  );
}
