import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { AddMemberForm } from "@/components/AddMemberForm";
import { CategoriesManager } from "@/components/CategoriesManager";
import { MembersManager } from "@/components/MembersManager";

export const metadata = { title: "Ambiente · Rachar" };
export const dynamic = "force-dynamic";

export default async function AmbientePage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
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
        <MembersManager
          members={ctx.members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            linkedUserId: m.linkedUserId,
            role: m.role,
          }))}
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
          Participantes com despesas ou acertos não podem ser eliminados.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="label">Adicionar participante</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Adiciona alguém para dividir despesas. Podes também dar-lhe acesso só
          para <span className="text-fg">submeter despesas</span> (com aprovação),
          marcando a opção e indicando o email com que vai entrar.
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
