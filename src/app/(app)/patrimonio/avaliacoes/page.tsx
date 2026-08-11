import { redirect } from "next/navigation";
import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { montarFunil, type AvaliacaoResumo } from "@/lib/domain";
import { FunilAvaliacoes } from "@/components/FunilAvaliacoes";

export const metadata = { title: "Funil de avaliação · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Onde é que cada empresa estudada está.
 *
 * **É a metade que faltava à calculadora.** Um DCF sozinho não decide nada; o
 * que decide é o que se faz a seguir, e é aí que uma folha de cálculo falha — o
 * estudo fica no ficheiro, a decisão fica na cabeça, e três meses depois já
 * ninguém sabe se aquela empresa foi descartada por cara, por má, ou se só ficou
 * por rever.
 */
export default async function Page() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  // A tabela pode não existir ainda (migração 0037 por correr). Um ecrã vazio é
  // melhor do que um erro, e a página diz o que fazer.
  const guardadas = await getRepository()
    .listValuations(ctx.space.id)
    .catch(() => []);

  const resumos: AvaliacaoResumo[] = guardadas.map((v) => ({
    id: v.id,
    simbolo: v.symbol,
    nome: v.name,
    etapa: v.stage,
    data: v.studyDate,
    precoPonderadoCents: v.weightedPriceCents,
    precoNaAlturaCents: v.priceAtStudyCents,
    upsidePct: v.upsidePct,
    notas: v.notes,
  }));

  const funil = montarFunil(resumos, new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Património</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Funil</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          As empresas que estudaste e onde é que cada decisão ficou. Cada estudo
          guarda os pressupostos do dia em que foi feito e nunca se recalcula
          sozinho — reavaliar cria um novo.
        </p>
      </div>

      <p className="text-sm text-fg-muted">
        <Link href="/patrimonio/dcf" className="underline underline-offset-2 hover:text-fg">
          Avaliar uma empresa
        </Link>
        .
      </p>

      <FunilAvaliacoes funil={funil} />
    </div>
  );
}
