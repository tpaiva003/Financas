import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { DcfCalculadora } from "@/components/DcfCalculadora";

export const metadata = { title: "Avaliação · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Avaliar uma empresa antes de a comprar.
 *
 * Vive no Património e não numa secção própria: é o passo antes de um
 * investimento existir, e é aí que se vai procurá-lo.
 */
export default async function Page() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Património</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Avaliação</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Quanto vale uma empresa pelos fluxos de caixa que gera. Os números não
          ficam guardados — é uma folha de rascunho.
        </p>
      </div>

      {/*
        O aviso vai em cima e não em baixo. Um DCF sai com ar de facto e é quase
        todo suposição; quem chega aqui tem de o saber antes de ver um número,
        não depois de já ter acreditado nele.
      */}
      <p className="rounded-xl border border-hair bg-panel2/40 px-4 py-3 text-xs leading-snug text-fg-muted">
        Isto não é aconselhamento financeiro e não substitui ler o relatório da
        empresa. O resultado depende inteiramente do que escreveres: mudar a
        taxa de desconto em um ponto percentual muda o valor por ação em dezenas
        de por cento. É por isso que aparece um intervalo e não um número.
      </p>

      <DcfCalculadora />
    </div>
  );
}
