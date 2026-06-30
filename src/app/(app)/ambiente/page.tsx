import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { AddMemberForm } from "@/components/AddMemberForm";
import { CategoriesManager } from "@/components/CategoriesManager";

export const metadata = { title: "Ambiente · Finanças" };
export const dynamic = "force-dynamic";

export default async function AmbientePage() {
  const ctx = await getSpaceContext();
  const categories = await getRepository().listCategories(ctx.space.id);
  const custom = categories.filter((c) => c.spaceId);
  const defaults = categories.filter((c) => !c.spaceId);

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Ambiente</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{ctx.space.name}</h1>
      </div>

      <section>
        <h2 className="eyebrow mb-2">Participantes ({ctx.members.length})</h2>
        <ul className="card divide-y divide-hair2 p-2">
          {ctx.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-hair font-mono text-[11px] text-fg">
                  {m.name.charAt(0)}
                </span>
                <div>
                  <p className="text-[15px] text-fg">{m.name}</p>
                  {m.email ? <p className="font-mono text-[11px] text-fg-faint">{m.email}</p> : null}
                </div>
              </div>
              {m.linkedUserId ? <span className="chip border-credit/30 text-credit">tem acesso</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="label">Adicionar participante</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Adiciona alguém para dividir despesas (ex.: a tua mãe nas viagens). Não
          precisa de conta; o email é opcional, para mais tarde poder entrar.
        </p>
        <AddMemberForm spaceId={ctx.space.id} />
      </section>

      <section>
        <h2 className="eyebrow mb-2">Categorias</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Ajusta as categorias deste ambiente (ex.: Casamento ou Férias na Casa). As
          categorias padrão ficam sempre disponíveis.
        </p>
        <CategoriesManager custom={custom} defaults={defaults} />
      </section>

      <Link href="/ambientes/novo" className="btn-secondary">+ Criar novo ambiente</Link>
    </div>
  );
}
