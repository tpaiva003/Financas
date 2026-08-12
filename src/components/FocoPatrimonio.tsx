/**
 * As caixas que escolhem o que o resumo conta.
 *
 * **Ligações, e não botões com estado no cliente.** O foco vai no endereço
 * (`/patrimonio?foco=investimento`), por isso sobrevive a um recarregamento,
 * pode ser guardado nos favoritos e funciona sem um único byte de JavaScript.
 * Um seletor de cliente teria de voltar ao servidor à mesma para refazer as
 * contas — ganhava-se uma animação e perdia-se o endereço.
 *
 * **Cada caixa mostra o seu próprio número.** Uma fila de rótulos obrigava a
 * carregar em cada um para descobrir quanto vale; com o valor à vista, a
 * comparação que motiva o filtro — quanto disto é casa e quanto é carteira —
 * faz-se sem carregar em nada.
 */

import Link from "next/link";
import { FOCOS, focoDe, formatCents, type FocoId } from "@/lib/domain";

export function FocoPatrimonio({
  atual,
  valores,
}: {
  atual: FocoId;
  /** O líquido de cada foco, já calculado no servidor. */
  valores: Record<FocoId, number>;
}) {
  return (
    <section>
      <nav aria-label="O que este resumo conta" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FOCOS.map((f) => {
          const ativo = f.id === atual;
          const valor = valores[f.id];
          return (
            <Link
              key={f.id}
              // "Tudo" é o endereço limpo: é o que está por omissão e não
              // precisa de o dizer no URL.
              href={f.id === "tudo" ? "/patrimonio" : `/patrimonio?foco=${f.id}`}
              aria-current={ativo ? "true" : undefined}
              className={`card px-4 py-3 text-left transition ${
                ativo
                  ? "border-fg/40 bg-panel2"
                  : "opacity-70 hover:border-fg/20 hover:opacity-100"
              }`}
            >
              <p className="text-xs font-medium text-fg">{f.label}</p>
              <p
                className={`mt-1 font-mono text-sm tnum ${
                  valor < 0 ? "text-debt" : "text-fg-muted"
                }`}
              >
                {formatCents(valor)}
              </p>
            </Link>
          );
        })}
      </nav>

      {/* A que pergunta esta vista responde. Um filtro escolhido sem saber o
          que muda faz duvidar do total que aparece a seguir. */}
      <p className="mt-2 text-xs text-fg-faint">{focoDe(atual).pergunta}</p>
    </section>
  );
}
