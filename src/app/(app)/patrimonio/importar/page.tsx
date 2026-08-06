import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { HoldingsImport } from "@/components/HoldingsImport";

export const metadata = { title: "Importar da corretora · Rachar" };
export const dynamic = "force-dynamic";

export default async function ImportarCarteiraPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Importar da corretora
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Carrega o extrato de posições e trazemos os teus ativos de uma vez, em
          vez de os escreveres um a um. Se a corretora for nova para nós, ensinas
          o formato e fica aprendido para quem vier a seguir.
        </p>
      </div>

      <HoldingsImport />
    </div>
  );
}
