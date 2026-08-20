/**
 * A carteira por setor, e as empresas por dinheiro que lhes entrou.
 *
 * **A pergunta a que isto responde e a lista de investimentos não responde.**
 * Doze linhas diferentes parecem doze apostas diferentes, e podem ser doze
 * apostas na mesma coisa. O número que desfaz essa sensação é sempre o mesmo:
 * quanto por cento está no maior setor.
 *
 * **As duas leituras estão lado a lado de propósito.** O peso no valor de hoje
 * diz onde é que o dinheiro está; o peso no dinheiro que entrou diz onde é que
 * se decidiu pô-lo. Um setor que subiu muito ocupa mais peso do que alguma vez
 * se decidiu dar-lhe — e é assim que uma concentração aparece sem ninguém a ter
 * escolhido.
 */

import Link from "next/link";
import {
  buildNetWorth,
  carteiraPorSetor,
  derivePosition,
  empresasPorReforco,
  formatCents,
  type PosicaoDoSetor,
  type Trade,
} from "@/lib/domain";
import type { Asset } from "@/lib/data";
import { DescobrirSetores } from "@/components/DescobrirSetores";

/** Compras e custos somam; vendas subtraem. Ver `reforcosPorMes`. */
function reforcoDe(movs: readonly Trade[]): number {
  return movs.reduce((s, t) => {
    const v = Math.abs(t.amountCents || 0);
    if (t.kind === "compra" || t.kind === "custo") return s + v;
    if (t.kind === "venda") return s - v;
    return s;
  }, 0);
}

export function AnaliseSetores({
  stored,
  tradesByAsset,
}: {
  stored: Asset[];
  tradesByAsset: Map<string, Trade[]>;
}) {
  const investimentos = stored.filter((a) => a.kind === "investimento");
  if (investimentos.length === 0) return null;

  // A mesma derivação do resto da app: quando há movimentos datados são eles
  // que dizem quantas unidades se tem e quanto custaram.
  const derivados = investimentos.map((a) => {
    const d = derivePosition(a, tradesByAsset.get(a.id) ?? []);
    return d.derived ? { ...a, quantity: d.quantity, unitCostCents: d.unitCostCents } : a;
  });
  const net = buildNetWorth(derivados);
  const vistaDe = new Map(net.assets.map((v) => [v.id, v]));

  const posicoes: PosicaoDoSetor[] = derivados.map((a) => {
    const v = vistaDe.get(a.id);
    return {
      id: a.id,
      nome: a.name,
      setor: a.sector ?? null,
      valorCents: v?.currentValueCents ?? 0,
      custoCents: Math.round((a.quantity ?? 0) * (a.unitCostCents ?? 0)),
      reforcoCents: reforcoDe(tradesByAsset.get(a.id) ?? []),
    };
  });

  const carteira = carteiraPorSetor(posicoes);
  const empresas = empresasPorReforco(posicoes);
  // Só os que dá para ir buscar: sem símbolo não há a quem perguntar.
  const porPerguntar = investimentos.filter((a) => a.symbol && !a.sector && !a.profileAt).length;

  if (carteira.grupos.length === 0) return null;

  return (
    <div className="space-y-7">
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Por setor</p>
          {porPerguntar > 0 ? <DescobrirSetores porPerguntar={porPerguntar} /> : null}
        </div>

        {carteira.maior ? (
          <p className="mb-1 text-sm text-fg-muted">
            O maior é{" "}
            <span className="text-fg">{carteira.maior.setor}</span>, com{" "}
            <span className="font-mono tnum text-fg">
              {String(carteira.maior.pesoPct).replace(".", ",")}%
            </span>{" "}
            do que a carteira vale hoje.
          </p>
        ) : null}

        {/*
          O que a leitura de cima vale.

          Com 40% da carteira por classificar, "o maior setor tem 22%" pode
          estar errado por muito — e um ecrã que mostre a percentagem sem dizer
          isto apresenta uma conta incompleta como se fosse a conta.
        */}
        {carteira.porClassificar > 0 ? (
          <p className="mb-3 text-xs leading-snug text-fg-faint">
            {carteira.porClassificar === 1
              ? "Um investimento ainda não tem setor"
              : `${carteira.porClassificar} investimentos ainda não têm setor`}{" "}
            ({String(carteira.porClassificarPct).replace(".", ",")}% do valor),
            e enquanto assim for as percentagens acima e abaixo estão incompletas.
          </p>
        ) : (
          <p className="mb-3 text-xs text-fg-faint">
            Uma carteira com muitos nomes pode ser uma aposta só. É esta a conta
            que o diz.
          </p>
        )}

        <ul className="space-y-3">
          {carteira.grupos.map((g) => {
            const max = Math.max(...carteira.grupos.map((x) => x.valorCents), 1);
            return (
              <li key={g.setor}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className={g.porClassificar ? "text-fg-faint" : "text-fg"}>
                    {g.setor}
                    <span className="ml-2 font-mono text-[11px] text-fg-faint">
                      {g.posicoes.length}
                    </span>
                  </span>
                  <span className="font-mono tnum text-xs text-fg-muted">
                    <span className="dinheiro">{formatCents(g.valorCents)}</span>
                    <span className="ml-2 text-fg-faint">
                      {String(g.pesoPct).replace(".", ",")}%
                    </span>
                    {g.ganhoPct !== null ? (
                      <span className={`ml-2 ${g.ganhoCents! >= 0 ? "text-credit" : "text-debt"}`}>
                        {g.ganhoCents! >= 0 ? "+" : ""}
                        {String(g.ganhoPct).replace(".", ",")}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                  <div
                    className={`h-full rounded-full ${g.porClassificar ? "bg-fg-faint/40" : "bg-credit"}`}
                    style={{ width: `${Math.max(2, (g.valorCents / max) * 100)}%` }}
                  />
                </div>
                {/*
                  O peso que se decidiu dar, por baixo do peso que ficou. Só
                  aparece quando os dois se afastam de forma que muda a leitura:
                  iguais, é ruído; a três pontos de distância, é a diferença
                  entre uma escolha e uma consequência.
                */}
                {g.pesoDoReforcoPct !== null &&
                Math.abs(g.pesoDoReforcoPct - g.pesoPct) >= 3 ? (
                  <p className="mt-1 text-[11px] text-fg-faint">
                    Do dinheiro que entrou, este setor levou{" "}
                    {String(g.pesoDoReforcoPct).replace(".", ",")}%
                    {g.pesoDoReforcoPct < g.pesoPct
                      ? ": pesa mais hoje do que o que se decidiu pôr nele."
                      : ": pesa menos hoje do que o que se decidiu pôr nele."}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {empresas.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-1">Por empresa, pelo dinheiro que lhe entrou</p>
          <p className="mb-3 text-xs leading-snug text-fg-faint">
            Ordenado pelo que se investiu e não pelo que vale hoje: a pergunta é
            sobre as decisões que tomaste, e a maior posição de hoje pode ser a
            que menos dinheiro levou.
          </p>

          <div className="scroll-x">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-right text-[11px] text-fg-muted">
                  <th className="pb-2 text-left font-normal">Empresa</th>
                  <th className="pb-2 pl-3 font-normal">Entrou</th>
                  <th className="pb-2 pl-3 font-normal">Vale hoje</th>
                  <th className="pb-2 pl-3 font-normal">Ganho</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id} className="border-t border-hair2">
                    <td className="py-1.5 pr-2 text-left">
                      <Link
                        href={`/patrimonio/ativos/${e.id}`}
                        className="text-xs text-fg underline-offset-4 hover:underline"
                      >
                        {e.nome}
                      </Link>
                      <span className="ml-2 text-[11px] text-fg-faint">{e.setorPorExtenso}</span>
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tnum text-xs text-fg-muted">
                      <span className="dinheiro">{formatCents(e.reforcoCents)}</span>
                      {e.pesoDoReforcoPct !== null ? (
                        <span className="ml-1.5 text-fg-faint">
                          {String(e.pesoDoReforcoPct).replace(".", ",")}%
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tnum text-xs text-fg">
                      <span className="dinheiro">{formatCents(e.valorCents)}</span>
                    </td>
                    <td
                      className={`py-1.5 pl-3 text-right font-mono tnum text-xs ${
                        e.ganhoCents === null
                          ? "text-fg-faint"
                          : e.ganhoCents >= 0
                            ? "text-credit"
                            : "text-debt"
                      }`}
                    >
                      {e.ganhoCents === null
                        ? "-"
                        : `${e.ganhoCents >= 0 ? "+" : ""}${String(e.ganhoPct).replace(".", ",")}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A mesma nota que o resumo do património já faz: "entrou" soma
              todas as compras, e o ganho é sobre o custo do que ainda se tem.
              São contas diferentes e sem isto pareciam contradizer-se. */}
          <p className="mt-3 text-[11px] leading-snug text-fg-faint">
            &ldquo;Entrou&rdquo; é todo o dinheiro que alguma vez foi para lá,
            menos o que saiu em vendas. O ganho é sobre o custo do que ainda
            tens, por isso os dois não têm de bater um com o outro. Um traço no
            ganho é uma posição sem custo registado, não é zero.
          </p>
        </section>
      ) : null}
    </div>
  );
}
