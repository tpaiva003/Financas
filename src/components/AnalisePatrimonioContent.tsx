import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { lerAtivos, lerMovimentos, lerSplits } from "@/lib/data/leituras";
import {
  analisarPatrimonio,
  aplicarSplits,
  buildNetWorthSeries,
  formatCents,
  type Trade,
} from "@/lib/domain";
import { getNetWorthHistoryCompleto } from "@/lib/services/networth-history-service";
import { AnaliseSetores } from "@/components/AnaliseSetores";

/**
 * Analisar o património: o que cresceu, quando, e de onde veio.
 *
 * **A separação da Análise em duas.** As despesas e o património respondem a
 * perguntas diferentes — "em que gasto" e "o que tenho a crescer" — e estavam
 * na mesma secção, o que fazia a segunda não existir: quem entrava na Análise
 * via só despesas.
 *
 * **A distinção que dá valor a esta página.** A linha do gráfico a subir não
 * diz de onde veio a subida, e são duas coisas diferentes: pôr dinheiro de lado
 * e o dinheiro que lá está valorizar. Num mês bom de bolsa a linha sobe sem
 * ninguém ter feito nada, e lê-se como mérito próprio.
 */
export async function AnalisePatrimonioContent() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const hoje = new Date().toISOString().slice(0, 10);
  // As três leituras vão juntas (eram quatro em fila indiana) e passam-se à
  // reconstrução como `jaLidos` — sem isto, o histórico voltava a lê-las todas
  // por dentro. E vêm pelas leituras memoizadas, partilhadas com o resto do
  // render.
  const [bens, movimentos, splits] = await Promise.all([
    lerAtivos(ctx.space.id).catch(() => []),
    lerMovimentos(ctx.space.id).catch(() => []),
    lerSplits(ctx.space.id).catch(() => []),
  ]);
  const historico = await getNetWorthHistoryCompleto(ctx.space.id, hoje, {
    stored: bens,
    trades: movimentos,
    splits,
  }).catch(() => null);

  // Os desdobramentos não mexem em dinheiro nenhum, mas aplicam-se à mesma:
  // esta página tem de contar a mesma história que as outras.
  const porBem = new Map<string, Trade[]>();
  for (const t of movimentos) porBem.set(t.assetId, [...(porBem.get(t.assetId) ?? []), t as Trade]);
  const ajustados: Trade[] = [];
  /**
   * Os mesmos movimentos, indexados por bem. A leitura por setor tem de contar
   * a mesma história que o resto da app — duas contagens diferentes da mesma
   * posição em dois ecrãs fazem quem vê os dois concluir, com razão, que um
   * deles está avariado. Enche-se aqui porque `aplicarSplits` devolve
   * movimentos de domínio, que já não sabem a que bem pertencem.
   */
  const ajustadosPorBem = new Map<string, Trade[]>();
  for (const [assetId, lista] of porBem) {
    const doBem = aplicarSplits(lista, splits.filter((s) => s.assetId === assetId));
    ajustadosPorBem.set(assetId, doBem);
    ajustados.push(...doBem);
  }

  const serie = historico ? buildNetWorthSeries(historico) : null;
  const analise = analisarPatrimonio(
    (serie?.points ?? []).map((p) => ({
      mes: p.onDate.slice(0, 7),
      netCents: p.netCents,
      estimado: p.estimado,
    })),
    ajustados,
  );

  const mes = (ym: string) =>
    new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Análise</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Património</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          O que cresceu, quando, e quanto disso foi dinheiro novo em vez de
          valorização.
        </p>
      </div>

      {analise.mesesMedidos === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-fg-muted">
            Ainda não há dois meses medidos para comparar.
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-fg-faint">
            A app guarda uma fotografia do património por dia. Os meses
            reconstruídos ficam de fora destas contas de propósito: trazem o
            saldo de hoje das contas projetado para trás, e a diferença entre
            duas estimativas não é um facto.{" "}
            <Link href="/patrimonio" className="underline underline-offset-4 hover:text-fg">
              Ver o património
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Cartao
              titulo="Melhor mês"
              valor={analise.melhorMes ? formatCents(analise.melhorMes.variacaoCents!) : null}
              nota={analise.melhorMes ? mes(analise.melhorMes.mes) : ""}
              positivo
            />
            <Cartao
              titulo="Pior mês"
              valor={analise.piorMes ? formatCents(analise.piorMes.variacaoCents!) : null}
              nota={analise.piorMes ? mes(analise.piorMes.mes) : ""}
              positivo={false}
            />
            <Cartao
              titulo="Mês com mais compras"
              valor={
                analise.mesComMaisCompras
                  ? `${analise.mesComMaisCompras.compras} ${analise.mesComMaisCompras.compras === 1 ? "compra" : "compras"}`
                  : null
              }
              nota={
                analise.mesComMaisCompras
                  ? `${mes(analise.mesComMaisCompras.mes)} · ${formatCents(analise.mesComMaisCompras.reforcoCents)}`
                  : "Ainda não há compras registadas."
              }
            />
            <Cartao
              titulo="Média por mês"
              valor={analise.mediaMensalCents !== null ? formatCents(analise.mediaMensalCents) : null}
              nota={`Sobre ${analise.mesesMedidos} ${analise.mesesMedidos === 1 ? "mês medido" : "meses medidos"}.`}
              positivo={(analise.mediaMensalCents ?? 0) >= 0}
            />
          </div>

          {/*
            A pergunta que o gráfico não responde: quanto do crescimento é
            dinheiro que se pôs, e quanto é o dinheiro que lá estava a valorizar.
          */}
          <section className="card p-5">
            <p className="eyebrow mb-1">De onde veio o crescimento</p>
            <p className="mb-3 text-xs leading-snug text-fg-faint">
              O que entrou é dinheiro teu. O resto é o que o património fez
              sozinho, e inclui tudo, não só os investimentos: uma casa a
              valorizar e um crédito a amortizar entram aqui na mesma conta. É um
              saldo, não uma rentabilidade.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-fg-muted">Dinheiro que puseste</p>
                <p className="mt-0.5 font-mono text-lg tnum text-fg">
                  {formatCents(analise.totalReforcosCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">O que não veio de reforços</p>
                <p
                  className={`mt-0.5 font-mono text-lg tnum ${
                    (analise.totalSemReforcosCents ?? 0) >= 0 ? "text-credit" : "text-debt"
                  }`}
                >
                  {analise.totalSemReforcosCents === null
                    ? "-"
                    : `${analise.totalSemReforcosCents >= 0 ? "+" : ""}${formatCents(analise.totalSemReforcosCents)}`}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="eyebrow mb-3">Mês a mês</h2>
            <ul className="card divide-y divide-hair2 p-0">
              {[...analise.meses].reverse().map((m) => (
                <li key={m.mes} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-fg">{mes(m.mes)}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">
                      {formatCents(m.netCents)}
                      {m.compras > 0
                        ? ` · ${m.compras} ${m.compras === 1 ? "compra" : "compras"}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {m.variacaoCents === null ? (
                      <span className="font-mono text-xs text-fg-faint">reconstruído</span>
                    ) : (
                      <>
                        <span
                          className={`block font-mono text-sm tnum ${m.variacaoCents >= 0 ? "text-credit" : "text-debt"}`}
                        >
                          {m.variacaoCents >= 0 ? "+" : ""}
                          {formatCents(m.variacaoCents)}
                        </span>
                        {m.reforcoCents !== 0 ? (
                          <span className="block font-mono text-[11px] text-fg-faint">
                            {formatCents(m.reforcoCents)} de reforço
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/*
        Fora do ramo de cima de propósito: a exposição por setor lê-se com uma
        carteira e zero meses de histórico. Escondê-la enquanto não houvesse
        dois meses medidos era esconder a única leitura desta página que não
        precisa de esperar por nada.
      */}
      <AnaliseSetores stored={bens} tradesByAsset={ajustadosPorBem} />
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  nota,
  positivo,
}: {
  titulo: string;
  valor: string | null;
  nota: string;
  positivo?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{titulo}</p>
      <p
        className={`mt-1.5 font-display text-2xl font-semibold tracking-tight tnum ${
          valor === null
            ? "text-fg-faint"
            : positivo === undefined
              ? "text-fg"
              : positivo
                ? "text-credit"
                : "text-debt"
        }`}
      >
        {valor ?? "-"}
      </p>
      <p className="mt-1 text-xs leading-snug text-fg-faint">{nota}</p>
    </div>
  );
}
