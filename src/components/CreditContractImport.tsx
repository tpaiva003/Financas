"use client";

/**
 * Carregar o contrato do crédito e deixar que ele preencha o formulário.
 *
 * **Porquê.** Registar um crédito à habitação à mão é ir buscar o montante, a
 * data da escritura, o prazo e dois ou três períodos de taxa com indexante e
 * spread ao meio de trinta páginas escritas para um notário. É chato o
 * suficiente para se fazer de qualquer maneira — e um crédito registado de
 * qualquer maneira dá uma prestação errada durante trinta anos.
 *
 * **Nada é gravado a partir daqui.** O que sai do contrato vai para os campos do
 * formulário, que continua por submeter. O ficheiro também não fica guardado em
 * lado nenhum: dá o texto e desaparece com o pedido.
 *
 * **Os avisos são o principal, não o acessório.** A parte que interessa desta
 * funcionalidade não é o que foi lido — é o que o programa recalculou por cima
 * e não bateu certo. Por isso os avisos aparecem antes dos valores e o botão de
 * usar não desaparece por causa deles: quem confirma é que decide, mas decide a
 * ver.
 */

import { useFormState, useFormStatus } from "react-dom";
import { extractCreditContractAction, type ContractExtractState } from "@/app/(app)/actions";
import {
  INDEXANTES,
  PERIODO_TIPO_LABELS,
  formatCents,
  type ContratoRevisto,
} from "@/lib/domain";

const vazio: ContractExtractState = {};

function Ler() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A ler o contrato…" : "Ler contrato"}
    </button>
  );
}

function Periodo({
  p,
}: {
  p: NonNullable<ContratoRevisto["terms"]>["periods"][number];
}) {
  const taxa =
    p.kind === "fixa"
      ? `${String(p.ratePct ?? "").replace(".", ",")}%`
      : `${p.indexante ? INDEXANTES[p.indexante] : "indexante por dizer"} + ${String(p.spreadPct ?? "").replace(".", ",")}%`;
  return (
    <li className="text-[11px] leading-snug text-fg-faint">
      <span className="text-fg-muted">{p.startsOn}</span> — {PERIODO_TIPO_LABELS[p.kind]}, {taxa}
    </li>
  );
}

export function CreditContractImport({ onUse }: { onUse: (r: ContratoRevisto) => void }) {
  const [state, ler] = useFormState(extractCreditContractAction, vazio);
  const r = state.revisto ?? null;

  return (
    <details className="card mb-4 p-4">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Preencher a partir do contrato
      </summary>

      <p className="mt-2 text-xs text-fg-faint">
        O PDF do contrato de crédito, para não escrever à mão o montante, o prazo
        e os períodos de taxa. O ficheiro é lido e deitado fora — não fica
        guardado. Nada é gravado: os campos ficam preenchidos e por confirmar.
      </p>

      <form action={ler} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="contract"
          accept=".pdf,.txt"
          required
          className="input text-xs file:mr-2 file:rounded-full file:border-0 file:bg-panel2 file:px-3 file:py-1 file:text-xs file:text-fg-muted"
        />
        <Ler />
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-xs text-debt">{state.error}</p>
      ) : null}

      {r ? (
        <div className="mt-4 space-y-3 rounded-xl border border-hair bg-panel2/30 p-4">
          {state.notas ? <p className="text-xs text-fg-muted">{state.notas}</p> : null}

          {/* Primeiro o que está mal, depois o que foi lido. Ao contrário,
              quem confirma vê os números bonitos e carrega no botão. */}
          {r.avisos.length > 0 ? (
            <ul className="space-y-1.5">
              {r.avisos.map((a) => (
                <li
                  key={a}
                  className="rounded-lg border border-debt/30 bg-debt/10 px-3 py-2 text-[11px] leading-snug text-fg-muted"
                >
                  {a}
                </li>
              ))}
            </ul>
          ) : null}

          {r.confirmacao ? (
            <p
              className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${
                r.confirmacao.bate
                  ? "border border-credit/30 bg-credit/10 text-fg-muted"
                  : "border border-debt/30 bg-debt/10 text-fg-muted"
              }`}
            >
              {r.confirmacao.bate ? "Confere: " : "Não confere: "}
              o contrato diz {formatCents(r.confirmacao.contratoCents)} de prestação e, com o
              montante, a taxa e o prazo que li, as contas dão{" "}
              {formatCents(r.confirmacao.calculadaCents)}.
            </p>
          ) : null}

          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-fg-faint">Montante emprestado</dt>
              <dd className="text-fg">
                {r.capitalCents === null ? "por apurar" : formatCents(r.capitalCents)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-faint">Início</dt>
              <dd className="text-fg">{r.startDate ?? "por apurar"}</dd>
            </div>
            <div>
              <dt className="text-fg-faint">Último pagamento</dt>
              <dd className="text-fg">{r.maturityDate ?? "por apurar"}</dd>
            </div>
            <div>
              <dt className="text-fg-faint">Prestação no contrato</dt>
              <dd className="text-fg">
                {r.statedPaymentCents === null ? "não vinha" : formatCents(r.statedPaymentCents)}
              </dd>
            </div>
          </dl>

          {r.terms ? (
            <div>
              <p className="label mb-1">Períodos de taxa</p>
              <ul className="space-y-1">
                {r.terms.periods.map((p) => (
                  <Periodo key={p.startsOn} p={p} />
                ))}
              </ul>
            </div>
          ) : null}

          {/* O montante do contrato é o que foi emprestado, não o que falta
              pagar. Num crédito com anos, a diferença são dezenas de milhares
              de euros — e é o erro mais fácil de deixar passar aqui. */}
          <p className="text-[11px] leading-snug text-fg-faint">
            O montante vai para o campo do que falta pagar, que é o que a app usa.
            Se o crédito já tem anos, corrige-o para o capital em dívida de hoje.
          </p>

          <button
            type="button"
            onClick={() => onUse(r)}
            disabled={!r.usable}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {r.usable ? "Preencher o formulário" : "Faltam dados para preencher"}
          </button>
        </div>
      ) : null}
    </details>
  );
}
