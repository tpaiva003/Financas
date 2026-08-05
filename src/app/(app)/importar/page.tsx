import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { ImportWizard } from "@/components/ImportWizard";
import { ImportReminders } from "@/components/ImportReminders";
import { undoImportBatchAction } from "@/app/(app)/actions";
import { getAllReminders } from "@/lib/services/reminder-service";
import { IMPORT_SOURCES } from "@/lib/import/types";

export const metadata = { title: "Importar extrato · Rachar" };
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  // Como se pode importar para qualquer ambiente, o histórico mostra todos.
  const perSpace = await Promise.all(
    ctx.spaces.map((s) =>
      repo
        .listImportBatches(s.id)
        // A tabela pode não existir se a migração não estiver aplicada.
        .catch(() => [])
        .then((list) => list.map((b) => ({ batch: b, spaceName: s.name }))),
    ),
  );
  const batches = perSpace
    .flat()
    .sort((a, b) => (a.batch.createdAt < b.batch.createdAt ? 1 : -1));

  const reminders = await getAllReminders(ctx.spaces.map((s) => ({ id: s.id, name: s.name })));

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
        spaces={ctx.spaces.map((s) => ({ id: s.id, name: s.name }))}
        currentSpaceId={ctx.space.id}
      />

      <ImportReminders spaces={reminders} />

      <section>
        <h2 className="eyebrow mb-2">Importações anteriores</h2>
        {batches.length === 0 ? (
          <p className="card p-6 text-center text-sm text-fg-muted">
            Ainda não importaste nenhum extrato.
          </p>
        ) : (
          <ul className="space-y-2">
            {batches.map(({ batch: b, spaceName }) => (
              <li key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {b.fileName || sourceLabel(b.source)}
                    <span className="ml-2 chip border-hair text-fg-faint">{spaceName}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    {new Date(b.createdAt).toLocaleDateString("pt-PT")} · {sourceLabel(b.source)} ·{" "}
                    {b.importedCount} importada(s)
                    {b.duplicateCount > 0 ? ` · ${b.duplicateCount} ignorada(s)` : ""}
                  </p>
                </div>
                <form action={undoImportBatchAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="spaceId" value={b.spaceId} />
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
