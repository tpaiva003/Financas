"use client";

/**
 * Apontar uma empresa no funil, antes de haver estudo nenhum.
 *
 * **É o passo mais barato do processo e era o único que a app não suportava.**
 * O funil servia só de arquivo: uma empresa só lá entrava depois de alguém ter
 * feito um DCF completo — quando o que se faz primeiro é o oposto, apontar um
 * nome ouvido numa conversa e voltar a ele daqui a duas semanas.
 *
 * **Fechado por omissão.** Um formulário sempre aberto no topo empurra o funil
 * para baixo e faz de escrever a acção principal, quando a principal é olhar
 * para o que já lá está.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { criarAvaliacaoAction, type ActionState } from "@/app/(app)/actions";
import { ETAPAS, ETAPA_LABEL } from "@/lib/domain";

const vazio: ActionState = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-sm" disabled={pending}>
      {pending ? "A guardar…" : "Guardar no funil"}
    </button>
  );
}

export function NovaAvaliacao({ hoje }: { hoje: string }) {
  const [state, criar] = useFormState(criarAvaliacaoAction, vazio);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAberto(true)} className="btn-secondary text-sm">
          Apontar uma empresa
        </button>
        {state.ok ? (
          <span className="text-xs text-credit">{state.message}</span>
        ) : (
          <span className="text-xs text-fg-faint">
            Sem estudo nenhum: só o nome, a data e o que te chamou a atenção.
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={criar} className="card space-y-4 p-5">
      <p className="eyebrow">Apontar uma empresa</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="na-nome" nome="name" label="Empresa" obrigatorio placeholder="Alphabet" />
        <Campo id="na-simbolo" nome="symbol" label="Símbolo (opcional)" mono placeholder="googl.us" />
      </div>

      {/* O logo já não se pede: descobre-se sozinho a partir do nome, como
          nos investimentos. Sem marca reconhecível ficam as iniciais. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          id="na-data"
          nome="studyDate"
          label="Data"
          tipo="date"
          valorInicial={hoje}
          ajuda="O dia em que a apontaste. Manda na ordem do funil."
        />
        <div>
          <label className="label" htmlFor="na-etapa">
            Etapa
          </label>
          <select id="na-etapa" name="stage" defaultValue="radar" className="input">
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ETAPA_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="na-notas">
          Notas
        </label>
        <textarea
          id="na-notas"
          name="notes"
          rows={3}
          placeholder="O que te chamou a atenção, e o que queres confirmar quando a fores estudar."
          className="input min-h-[4.5rem] resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Botao />
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-fg-faint hover:text-fg">
          Cancelar
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-debt">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Campo({
  id,
  nome,
  label,
  placeholder,
  tipo = "text",
  valorInicial,
  mono,
  obrigatorio,
  ajuda,
}: {
  id: string;
  nome: string;
  label: string;
  placeholder?: string;
  tipo?: string;
  valorInicial?: string;
  mono?: boolean;
  obrigatorio?: boolean;
  ajuda?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={nome}
        type={tipo}
        required={obrigatorio}
        defaultValue={valorInicial}
        placeholder={placeholder}
        className={`input ${mono ? "font-mono" : ""}`}
      />
      {ajuda ? <p className="mt-1 text-xs text-fg-faint">{ajuda}</p> : null}
    </div>
  );
}
