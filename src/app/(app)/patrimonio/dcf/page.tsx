import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { DcfCalculadora, type VindoDoFunil } from "@/components/DcfCalculadora";

export const metadata = { title: "Avaliação · Rachar" };
export const dynamic = "force-dynamic";

/** Um valor em cêntimos, em milhares de milhões, como o formulário o escreve. */
function mM(cents: number | null): number {
  return cents === null ? 0 : Math.round((cents / 100 / 1_000_000_000) * 1000) / 1000;
}

/**
 * Avaliar uma empresa antes de a comprar.
 *
 * Vive no Património e não numa secção própria: é o passo antes de um
 * investimento existir, e é aí que se vai procurá-lo.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  /**
   * Vindo do funil, o ecrã abre já com tudo o que se sabe da empresa.
   *
   * **Só o id viaja no endereço; o resto é lido aqui.** Um DCF tem onze
   * pressupostos: enfiá-los no URL dava um endereço ilegível e — pior — deixava
   * fabricar um estudo com os números que se quisesse, à espera que alguém
   * carregasse em guardar sem reparar. O id é confrontado com o ambiente antes
   * de se ler seja o que for, e a ação de gravar volta a confrontá-lo.
   */
  const id = searchParams?.id?.trim() || null;
  /**
   * Os estudos deste ambiente, numa leitura só.
   *
   * Servem para duas coisas: encontrar o que veio do funil, e comparar a
   * empresa em estudo com as que já foram estudadas no mesmo setor. Lê-los duas
   * vezes para as duas coisas era ir buscar a mesma lista a seguir a si própria.
   */
  const estudos = await getRepository().listValuations(ctx.space.id).catch(() => []);
  const guardada = id ? estudos.find((v) => v.id === id) : undefined;

  const doFunil: VindoDoFunil = {
    id: guardada?.id ?? null,
    nome: guardada?.name ?? "",
    simbolo: guardada?.symbol ?? "",
    notas: guardada?.notes ?? "",
    // Ou o estudo está inteiro, ou não existe — o `check` da 0038 garante-o do
    // lado da base de dados, e este `if` diz o mesmo do lado do ecrã.
    estudo:
      guardada && guardada.fcfCents !== null && guardada.shares !== null
        ? {
            fcfBilioes: mM(guardada.fcfCents),
            acoesBilioes: Math.round((guardada.shares / 1_000_000_000) * 1000) / 1000,
            dividaLiquidaBilioes: mM(guardada.netDebtCents),
            descontoPct: guardada.discountPct ?? 8.5,
            perpetuoPct: guardada.perpetualPct ?? 2,
            anos: guardada.years ?? 10,
            margemPct: guardada.marginPct ?? 30,
            precoUnidade:
              guardada.priceAtStudyCents === null
                ? null
                : Math.round(guardada.priceAtStudyCents) / 100,
            cenarios: guardada.scenarios,
          }
        : null,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Património</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Avaliação</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Quanto vale uma empresa pelos fluxos de caixa que gera. Enquanto mexes,
          nada sai do teu browser; no fim podes guardar o estudo no{" "}
          <Link href="/patrimonio/avaliacoes" className="underline underline-offset-2 hover:text-fg">
            funil
          </Link>
          , com os pressupostos que o produziram.
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

      {/*
        Quando isto é uma reavaliação, diz-se de quando são os números que estão
        nos campos. Sem essa linha, um formulário preenchido lê-se como dados de
        agora — e os pressupostos de há seis meses passavam por actuais.
      */}
      {guardada?.valuedAt ? (
        <p className="rounded-xl border border-hair bg-panel2/40 px-4 py-3 text-xs leading-snug text-fg-muted">
          Os campos estão como os deixaste no estudo de{" "}
          <strong className="font-medium text-fg">
            {new Date(`${guardada.valuedAt}T00:00:00Z`).toLocaleDateString("pt-PT")}
          </strong>
          . Muda o que mudou e guarda outra vez — o estudo antigo fica lá, com a
          data dele.
        </p>
      ) : null}

      <DcfCalculadora
        doFunil={doFunil}
        anteriores={estudos
          // Só os que passaram pela busca de dados têm rácios para comparar.
          .filter((v) => v.sector)
          .map((v) => ({
            id: v.id,
            nome: v.name,
            setor: v.sector,
            rocePct: v.rocePct,
            margemOperacionalPct: v.margemOperacionalPct,
            margemFcfPct: v.margemFcfPct,
            crescimentoFcfPct: v.crescimentoFcfPct,
          }))}
      />
    </div>
  );
}
