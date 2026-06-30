import Link from "next/link";
import { requireUser } from "@/lib/session";
import { CreateSpaceForm } from "@/components/CreateSpaceForm";

export const metadata = { title: "Novo ambiente · Finanças" };
export const dynamic = "force-dynamic";

export default async function NovoAmbientePage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/ambiente" className="eyebrow transition-colors hover:text-fg">
          ← Ambiente
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Novo ambiente</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Um espaço separado de contas (ex.: &ldquo;Viagens com a mãe&rdquo;). Ficas como
          participante automaticamente.
        </p>
      </div>
      <CreateSpaceForm creatorName={user.name} />
    </div>
  );
}
