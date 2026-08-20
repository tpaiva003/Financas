"use client";

/**
 * Arrumar à mão o que a fonte não arrumou.
 *
 * **Porque é que isto tem de existir ao lado do botão automático.** A consulta
 * resolve a maioria e deixa sempre um resto que ela nunca vai resolver: um
 * investimento sem símbolo não tem a quem perguntar, a fonte não classifica
 * fundos por setor, e há nomes que ela não conhece. Sem isto, a análise dizia
 * "40% do valor por classificar" — uma lacuna à vista, verdadeira, e sem
 * nenhuma forma de a fechar. Um ecrã que aponta um problema que não deixa
 * resolver é pior do que um ecrã que não o aponta.
 *
 * **Fechado por omissão.** Quem chega à análise vem ver a carteira, não vem
 * preencher uma tabela; e quando não falta nada, não aparece de todo.
 *
 * **Uma gravação para a lista toda.** Um botão por linha eram doze idas ao
 * servidor e doze recargas para arrumar uma carteira.
 */

import { useFormState, useFormStatus } from "react-dom";
import { classificarInvestimentosAction, type ActionState } from "@/app/(app)/actions";
import { SETORES_PT, TIPOS_PT } from "@/lib/domain";

const vazio: ActionState = {};

export interface PorClassificar {
  id: string;
  nome: string;
  /** O que já lá está, quando já lá está alguma coisa. */
  setor: string | null;
  instrumento: string | null;
  /** Sem símbolo não há a quem perguntar: é o que explica porque está aqui. */
  temSimbolo: boolean;
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A gravar…" : "Guardar"}
    </button>
  );
}

export function ClassificarInvestimentos({ bens }: { bens: PorClassificar[] }) {
  const [state, classificar] = useFormState(classificarInvestimentosAction, vazio);
  if (bens.length === 0) return null;

  return (
    <details className="mt-4 border-t border-hair2 pt-3">
      <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
        Classificar à mão ({bens.length})
      </summary>

      <p className="mt-2 text-[11px] leading-snug text-fg-faint">
        A fonte não classifica fundos por setor e não conhece o que não tem
        símbolo. O que escreveres aqui fica: a consulta automática só preenche o
        que está vazio.
      </p>

      <form action={classificar} className="mt-3 space-y-2">
        {bens.map((b) => (
          <div key={b.id} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <span className="truncate text-xs text-fg">
              {b.nome}
              {b.temSimbolo ? null : (
                <span className="ml-2 text-[10px] text-fg-faint">sem símbolo</span>
              )}
            </span>

            <label className="sr-only" htmlFor={`setor-${b.id}`}>
              Setor de {b.nome}
            </label>
            <select
              id={`setor-${b.id}`}
              name={`setor-${b.id}`}
              defaultValue={b.setor ?? ""}
              className="select h-8 py-0 text-xs sm:w-44"
            >
              <option value="">Setor…</option>
              {/* As chaves são o nome como a fonte o escreve — é isso que se
                  grava, para a tradução continuar a viver num sítio só. */}
              {Object.entries(SETORES_PT).map(([bruto, pt]) => (
                <option key={bruto} value={bruto}>
                  {pt}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor={`tipo-${b.id}`}>
              Tipo de {b.nome}
            </label>
            <select
              id={`tipo-${b.id}`}
              name={`tipo-${b.id}`}
              defaultValue={b.instrumento ?? ""}
              className="select h-8 py-0 text-xs sm:w-32"
            >
              <option value="">Tipo…</option>
              {Object.entries(TIPOS_PT).map(([bruto, pt]) => (
                <option key={bruto} value={bruto}>
                  {pt}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Guardar />
          {state.ok ? <span className="text-[11px] text-fg-faint">{state.message}</span> : null}
          {state.error ? (
            <span role="alert" className="text-[11px] text-debt">
              {state.error}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
