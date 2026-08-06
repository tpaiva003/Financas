import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { BrokerImport } from "@/components/BrokerImport";

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
          Traz o que já tens na corretora, em vez de o escreveres a um a um.
          Aceita vários ficheiros de uma vez e percebe sozinho o que cada um é.
          Se a corretora for nova para nós, ensinas o formato e fica aprendido
          para quem vier a seguir.
        </p>
      </div>

      <BrokerImport />
    </div>
  );
}
