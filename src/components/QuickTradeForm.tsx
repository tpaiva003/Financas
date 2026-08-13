"use client";

/**
 * Registar uma compra ou uma venda sem sair da lista.
 *
 * **Porquê existir, ao lado do formulário completo.** Depois da primeira
 * importação, manter a carteira em dia é sobretudo lançar a venda que se fez
 * ontem. Obrigar a abrir o investimento e a descer a página para isso é o
 * género de atrito que faz com que ninguém mantenha nada atualizado — e uma
 * carteira desatualizada mente em todos os números que a app calcula a partir
 * dela.
 *
 * **É deliberadamente pequeno.** Data, unidades e valor, em euros. Câmbio,
 * dividendos e comissões continuam no formulário completo da ficha do ativo,
 * porque exigem cuidado (a taxa da corretora não é a do BCE) e não são o que se
 * faz todas as semanas. Meter tudo aqui tornava o caminho rápido no caminho
 * lento.
 *
 * O valor é o que saiu ou entrou na conta, e o preço por unidade sai dele. É
 * assim que a nota da corretora vem, e evita a pessoa ter de dividir de cabeça.
 */

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addAssetTradeAction, type ActionState } from "@/app/(app)/actions";
import { formatCents } from "@/lib/domain";

const empty: ActionState = {};

function parse(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function Submit({ vender }: { vender: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary h-9 w-full text-xs" disabled={pending}>
      {pending ? "A gravar…" : vender ? "Registar venda" : "Registar compra"}
    </button>
  );
}

export function QuickTradeForm({
  assetId,
  unitPriceCents,
  maxQuantity,
  onDone,
}: {
  assetId: string;
  /** Cotação atual, para propor o valor e poupar contas de cabeça. */
  unitPriceCents: number | null;
  /** Quantas unidades há. Serve para avisar de uma venda a mais. */
  maxQuantity: number;
  onDone?: () => void;
}) {
  const [state, action] = useFormState(addAssetTradeAction, empty);
  const [vender, setVender] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [valor, setValor] = useState("");
  const ref = useRef<HTMLFormElement>(null);

  // Fecha e limpa só depois de gravar mesmo.
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setQuantidade("");
      setValor("");
      onDone?.();
    }
  }, [state, onDone]);

  const qtd = parse(quantidade);
  const val = parse(valor);

  /**
   * O valor sugerido à cotação de hoje.
   *
   * É uma sugestão para poupar a conta, nunca um valor imposto: o que conta é
   * o que a corretora executou, que raramente é o fecho do dia.
   */
  const sugestao =
    qtd !== null && qtd > 0 && unitPriceCents !== null
      ? Math.round(qtd * unitPriceCents)
      : null;

  // Vender mais do que se tem não é impedido — pode faltar uma compra por
  // lançar —, mas é dito, porque desequilibra a posição e a mais-valia.
  const vendeAMais = vender && qtd !== null && qtd > maxQuantity;

  return (
    <form ref={ref} action={action} className="space-y-2.5">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="kind" value={vender ? "venda" : "compra"} />
      <input type="hidden" name="currency" value="EUR" />

      <div className="flex gap-1.5" role="group" aria-label="Tipo de movimento">
        {[
          { label: "Comprei", v: false },
          { label: "Vendi", v: true },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setVender(o.v)}
            aria-pressed={vender === o.v}
            className={`h-8 flex-1 rounded-full border text-xs transition ${
              vender === o.v
                ? "border-fg bg-fg text-bg"
                : "border-hair bg-transparent text-fg-muted hover:border-fg/30"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor={`qt-data-${assetId}`}>Quando</label>
        <input
          id={`qt-data-${assetId}`}
          name="date"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="input h-9 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`qt-qtd-${assetId}`}>Unidades</label>
          <input
            id={`qt-qtd-${assetId}`}
            name="quantity"
            inputMode="decimal"
            required
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="10"
            className="input h-9 text-xs"
          />
        </div>
        <div>
          <label className="label" htmlFor={`qt-val-${assetId}`}>Valor (€)</label>
          <input
            id={`qt-val-${assetId}`}
            name="amount"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={sugestao !== null ? (sugestao / 100).toFixed(2).replace(".", ",") : "0,00"}
            className="input h-9 text-xs"
          />
        </div>
      </div>

      {sugestao !== null && val === null ? (
        <button
          type="button"
          onClick={() => setValor((sugestao / 100).toFixed(2).replace(".", ","))}
          className="text-[11px] text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          Usar {formatCents(sugestao)}, à cotação de hoje
        </button>
      ) : null}

      {vendeAMais ? (
        <p className="text-[11px] leading-snug text-debt">
          Só há {maxQuantity} unidades registadas. Se vendeste mais, falta uma
          compra por lançar — e sem ela a mais-valia fica errada.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-[11px] leading-snug text-debt">{state.error}</p>
      ) : null}

      <Submit vender={vender} />

      <p className="text-[11px] leading-snug text-fg-faint">
        Dividendos, comissões e moeda estrangeira ficam no investimento, que é
        onde se pode conferir o câmbio.
      </p>
    </form>
  );
}
