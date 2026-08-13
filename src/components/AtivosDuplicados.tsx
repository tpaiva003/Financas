"use client";

/**
 * Os investimentos registados duas vezes, e o botão para os juntar.
 *
 * **Aparece sozinho, sem se ir procurar.** Um duplicado não se denuncia: os dois
 * cartões parecem certos, cada um com o seu nome e a sua posição, e o que está
 * errado só se vê no total — que é o número em que ninguém repara estar 40%
 * acima. Escondê-lo atrás de um separador de manutenção era garantir que ficava
 * lá para sempre.
 *
 * **Quem escolhe qual fica é quem lê.** A app sugere o que tem mais movimentos,
 * porque é o que menos custa manter, mas a escolha muda para onde vão todos os
 * movimentos e qual o registo que desaparece — é do dono, não da app.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { fundirAtivosAction, type ActionState } from "@/app/(app)/actions";
import type { GrupoDuplicado } from "@/lib/domain";

const vazio: ActionState = {};

function Botao({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A juntar…" : `Juntar em "${nome}"`}
    </button>
  );
}

export function AtivosDuplicados({ grupos }: { grupos: GrupoDuplicado[] }) {
  if (grupos.length === 0) return null;

  return (
    <section className="rounded-xl border border-warn/30 bg-warn/5 p-4">
      <p className="text-sm font-medium text-fg">Investimentos registados mais do que uma vez</p>
      <p className="mt-1 max-w-prose text-xs leading-snug text-fg-muted">
        Vieram de importações em que a corretora escreveu o nome de maneiras
        diferentes. Enquanto forem dois, o dinheiro conta a dobrar no investido e
        a posição aparece partida ao meio — com a rentabilidade de cada metade
        calculada contra o custo da outra.
      </p>

      <div className="mt-3 space-y-3">
        {grupos.map((g) => (
          <Grupo key={g.simbolo} grupo={g} />
        ))}
      </div>
    </section>
  );
}

function Grupo({ grupo }: { grupo: GrupoDuplicado }) {
  const [state, fundir] = useFormState(fundirAtivosAction, vazio);
  const [manterId, setManterId] = useState(grupo.sugeridoId);

  if (state.ok) {
    return (
      <p className="rounded-lg border border-credit/30 bg-credit/10 px-3 py-2 text-xs leading-relaxed text-fg-muted">
        {state.message}
      </p>
    );
  }

  const manter = grupo.membros.find((m) => m.ativo.id === manterId);
  // Só se juntam dois de cada vez. Com três registos, junta-se um par e o botão
  // volta a aparecer para o que sobra — é mais lento e é reversível de cabeça,
  // que é o que interessa quando o passo seguinte apaga um registo.
  const remover = grupo.membros.find((m) => m.ativo.id !== manterId);
  if (!manter || !remover) return null;

  return (
    <div className="rounded-lg border border-hair bg-panel2/40 p-3">
      <p className="font-mono text-[11px] uppercase text-fg-faint">{grupo.simbolo}</p>

      <fieldset className="mt-2 space-y-1.5">
        <legend className="sr-only">Qual dos registos fica</legend>
        {grupo.membros.map((m) => (
          <label key={m.ativo.id} className="flex items-start gap-2 text-xs leading-snug">
            <input
              type="radio"
              name={`fica-${grupo.simbolo}`}
              checked={m.ativo.id === manterId}
              onChange={() => setManterId(m.ativo.id)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="text-fg">{m.ativo.name}</span>{" "}
              <span className="text-fg-faint">
                ({m.movimentos} {m.movimentos === 1 ? "movimento" : "movimentos"}
                {m.ativo.id === grupo.sugeridoId ? ", sugerido" : ""})
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <form action={fundir} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="manterId" value={manterId} />
        <input type="hidden" name="removerId" value={remover.ativo.id} />
        <Botao nome={manter.ativo.name} />
        <span className="text-[11px] leading-snug text-fg-faint">
          Os {remover.movimentos} movimentos e os anexos de &ldquo;{remover.ativo.name}
          &rdquo; passam para o outro. Não se apaga movimento nenhum.
        </span>
      </form>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs leading-snug text-debt">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
