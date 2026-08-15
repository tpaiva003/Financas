"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveIncomeAction, type ActionState } from "@/app/(app)/actions";
import {
  INCOME_KIND_LABELS,
  TAXA_SEGURANCA_SOCIAL_PCT,
  formatCents,
  liquidoDoBruto,
  type IncomeKind,
} from "@/lib/domain";

const empty: ActionState = {};

/** Um rendimento já registado, quando isto está a corrigir em vez de a criar. */
export interface RendimentoAEditar {
  id: string;
  kind: string;
  description: string;
  amountCents: number;
  date: string;
  recurring: boolean;
  notes?: string | null;
}

/** Em português, 1234.5 escreve-se 1234,5. */
function decimal(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Registar — ou corrigir — um rendimento.
 *
 * O valor pedido é o LÍQUIDO recebido, não o bruto: é o que se pode gastar, e
 * é sobre isso que a taxa de poupança faz sentido.
 *
 * **O mesmo formulário faz as duas coisas.** Um segundo formulário só para
 * corrigir divergiria do primeiro à primeira alteração — um campo novo aqui que
 * ninguém se lembra de acrescentar lá, e passa a haver rendimentos que só se
 * conseguem criar ou só corrigir. Com `existente` presente, o id viaja num campo
 * escondido e a ação grava por cima em vez de criar.
 */
export function IncomeForm({ existente }: { existente?: RendimentoAEditar } = {}) {
  const [state, action] = useFormState(saveIncomeAction, empty);
  const hoje = new Date().toISOString().slice(0, 10);
  const aCorrigir = Boolean(existente);
  // Os ids dos campos têm de ser únicos na página: com uma lista de
  // rendimentos, cada linha desenha o seu formulário e um `htmlFor` repetido
  // punha o rótulo a apontar para a caixa de outra linha.
  const uid = existente?.id ?? "novo";
  /**
   * O líquido é controlado porque a calculadora do bruto o preenche.
   *
   * **Preenche, não substitui.** O que fica gravado continua a ser o líquido,
   * escrito à mão ou vindo da conta — e continua editável depois de a conta o
   * pôr lá. Guardar o bruto ao lado obrigaria os dois a concordar para sempre,
   * e mais cedo ou mais tarde deixavam.
   */
  const [liquido, setLiquido] = useState(existente ? decimal(existente.amountCents) : "");

  return (
    <details className={aCorrigir ? "" : "card p-5"} open={aCorrigir ? undefined : false}>
      <summary
        className={
          aCorrigir
            ? "cursor-pointer text-xs text-fg-faint hover:text-fg-muted"
            : "cursor-pointer text-sm font-medium text-fg"
        }
      >
        {aCorrigir ? "Corrigir" : "Registar rendimento"}
      </summary>

      <form action={action} className="mt-4 space-y-4">
        {existente ? <input type="hidden" name="id" value={existente.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`inc-desc-${uid}`}>Descrição</label>
            <input
              id={`inc-desc-${uid}`}
              name="description"
              required
              maxLength={120}
              defaultValue={existente?.description}
              placeholder="ex.: Ordenado de agosto"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`inc-kind-${uid}`}>Tipo</label>
            <select
              id={`inc-kind-${uid}`}
              name="kind"
              defaultValue={existente?.kind ?? "salario"}
              className="select"
            >
              {(Object.keys(INCOME_KIND_LABELS) as IncomeKind[]).map((k) => (
                <option key={k} value={k}>{INCOME_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`inc-amount-${uid}`}>Valor recebido (líquido)</label>
            <input
              id={`inc-amount-${uid}`}
              name="amount"
              inputMode="decimal"
              required
              value={liquido}
              onChange={(e) => setLiquido(e.target.value)}
              placeholder="0,00"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`inc-date-${uid}`}>Data</label>
            <input
              id={`inc-date-${uid}`}
              name="date"
              type="date"
              defaultValue={existente?.date ?? hoje}
              className="input"
            />
          </div>
        </div>

        <DoBruto uid={uid} aoCalcular={(v) => setLiquido(v)} />

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            name="recurring"
            defaultChecked={existente?.recurring}
            className="h-4 w-4 accent-fg"
          />
          Recebo isto todos os meses
        </label>

        <div>
          <label className="label" htmlFor={`inc-notes-${uid}`}>Nota (opcional)</label>
          <input
            id={`inc-notes-${uid}`}
            name="notes"
            maxLength={300}
            defaultValue={existente?.notes ?? ""}
            className="input"
          />
        </div>

        {state.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

        <SaveButton aCorrigir={aCorrigir} />
      </form>
    </details>
  );
}

/**
 * Chegar ao líquido a partir do bruto.
 *
 * **A taxa de IRS pede-se, não se adivinha.** As tabelas de retenção mudam
 * todos os anos e dependem do agregado; a taxa que interessa está escrita no
 * recibo de vencimento de quem está a preencher isto. Adivinhá-la daria um
 * número com o tamanho certo e o valor errado — e no sítio do ordenado, esse
 * engano alimenta a taxa de poupança, o FIRE e tudo o que vem a seguir.
 *
 * A Segurança Social é o oposto: percentagem única, estável há anos, e não
 * depende de agregado nenhum. Essa a app sabe, e vem preenchida.
 *
 * **Não grava nada.** É uma calculadora que enche o campo do líquido lá em
 * cima, e o líquido continua editável à mão depois disso.
 */
function DoBruto({
  uid,
  aoCalcular,
}: {
  uid: string;
  aoCalcular: (valor: string) => void;
}) {
  const [bruto, setBruto] = useState("");
  const [irs, setIrs] = useState("");
  const [ss, setSs] = useState(String(TAXA_SEGURANCA_SOCIAL_PCT));

  const num = (v: string) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : Number.NaN;
  };
  const conta = liquidoDoBruto({
    brutoCents: Math.round(num(bruto) * 100),
    irsPct: irs.trim() === "" ? null : num(irs),
    ssPct: ss.trim() === "" ? undefined : num(ss),
  });

  return (
    <details className="rounded-xl border border-hair2 px-4 py-3">
      <summary className="cursor-pointer text-xs text-fg-faint hover:text-fg-muted">
        Não sabes o líquido? Calcula a partir do bruto
      </summary>

      <p className="mt-2 text-xs leading-snug text-fg-faint">
        A taxa de IRS é a que vem no teu recibo de vencimento. Não a adivinho: as
        tabelas de retenção mudam todos os anos e dependem do agregado, e um
        número errado aqui alastra a tudo o resto. A Segurança Social já vem
        preenchida — essa é fixa.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`inc-bruto-${uid}`}>Bruto</label>
          <input
            id={`inc-bruto-${uid}`}
            inputMode="decimal"
            value={bruto}
            onChange={(e) => setBruto(e.target.value)}
            placeholder="0,00"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`inc-irs-${uid}`}>IRS (%)</label>
          <input
            id={`inc-irs-${uid}`}
            inputMode="decimal"
            value={irs}
            onChange={(e) => setIrs(e.target.value)}
            placeholder="15"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`inc-ss-${uid}`}>Seg. Social (%)</label>
          <input
            id={`inc-ss-${uid}`}
            inputMode="decimal"
            value={ss}
            onChange={(e) => setSs(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {conta ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs tnum text-fg-muted">
            {formatCents(conta.brutoCents)} − {formatCents(conta.ssCents)} −{" "}
            {formatCents(conta.irsCents)} ={" "}
            <span className="text-fg">{formatCents(conta.liquidoCents)}</span>
          </p>
          <button
            type="button"
            onClick={() => aoCalcular(decimal(conta.liquidoCents))}
            className="btn-secondary h-9 px-3 text-xs"
          >
            Usar este valor
          </button>
        </div>
      ) : (
        /* O que falta, por palavras. Um resultado que não aparece e não diz
           porquê lê-se como avaria. */
        <p className="mt-3 text-xs text-fg-faint">
          {bruto.trim() === ""
            ? "Escreve o bruto."
            : irs.trim() === ""
              ? "Falta a taxa de IRS do teu recibo."
              : "Os valores não dão uma conta possível — confere as percentagens."}
        </p>
      )}
    </details>
  );
}

function SaveButton({ aCorrigir }: { aCorrigir: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : aCorrigir ? "Gravar" : "Registar"}
    </button>
  );
}
