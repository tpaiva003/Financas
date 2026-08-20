import { redirect } from "next/navigation";
import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { montarFunil, type AvaliacaoResumo } from "@/lib/domain";
import { resumoAnexosAvailable } from "@/lib/services/ia-disponivel";
import { DescobrirMarcas } from "@/components/DescobrirMarcas";
import { FunilAvaliacoes } from "@/components/FunilAvaliacoes";
import { NovaAvaliacao } from "@/components/NovaAvaliacao";
import type { AnexoAvaliacaoView } from "@/components/AvaliacaoAnexos";

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

  const repo = getRepository();
  // As tabelas podem não existir ainda (migrações 0037/0038 por correr). Um ecrã
  // vazio é melhor do que um erro, e a página diz o que fazer.
  const [guardadas, anexos] = await Promise.all([
    repo.listValuations(ctx.space.id).catch(() => []),
    repo.listValuationAttachments(ctx.space.id).catch(() => []),
  ]);

  const resumos: AvaliacaoResumo[] = guardadas.map((v) => ({
    id: v.id,
    simbolo: v.symbol,
    nome: v.name,
    etapa: v.stage,
    data: v.studyDate,
    dataDoEstudo: v.valuedAt,
    precoPonderadoCents: v.weightedPriceCents,
    precoNaAlturaCents: v.priceAtStudyCents,
    upsidePct: v.upsidePct,
    notas: v.notes,
    logoDomain: v.logoDomain,
    resumoIa: v.aiSummary,
    resumoIaEm: v.aiSummaryAt,
  }));

  const hoje = new Date().toISOString().slice(0, 10);
  const funil = montarFunil(resumos, hoje);

  // Só os que chegaram mesmo ao Storage: uma linha em `a-enviar` é um envio que
  // falhou, e prometer um ficheiro que não está lá é pior do que não o listar.
  const porAvaliacao: Record<string, AnexoAvaliacaoView[]> = {};
  for (const a of anexos) {
    if (a.status !== "pronto") continue;
    (porAvaliacao[a.valuationId] ??= []).push({
      id: a.id,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Património</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Funil</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          As empresas que te interessam e onde é que cada decisão ficou. Aponta
          uma antes de saber nada dela; quando a estudares, o estudo fica
          agarrado a ela com os pressupostos do dia em que o fizeste.{" "}
          <Link href="/patrimonio/dcf" className="underline underline-offset-2 hover:text-fg">
            Avaliar uma empresa
          </Link>
          .
        </p>
      </div>

      <NovaAvaliacao hoje={hoje} />

      {/* O mesmo «Pôr logos» dos investimentos, para as linhas que ficaram
          sem marca (o campo manual saiu; o logo descobre-se sozinho). */}
      {funil.some((a) => !a.logoDomain) ? <DescobrirMarcas alvo="funil" /> : null}

      <FunilAvaliacoes
        funil={funil}
        anexosPorAvaliacao={porAvaliacao}
        podeResumir={resumoAnexosAvailable()}
      />
    </div>
  );
}
