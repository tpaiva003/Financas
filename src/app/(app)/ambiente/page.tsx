import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { AddMemberForm } from "@/components/AddMemberForm";
import { CategoriesManager } from "@/components/CategoriesManager";
import { MembersManager } from "@/components/MembersManager";

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
        <MembersManager
          members={ctx.members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            linkedUserId: m.linkedUserId,
          }))}
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
          Participantes com despesas ou acertos não podem ser eliminados.
        </p>
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
