"use client";

/**
 * Falar com a app sobre a própria situação.
 *
 * **O que vai para fora, e o ecrã diz.** Um resumo dos números — património,
 * dívidas com taxa e prestação, médias de despesa por categoria, evolução — já
 * calculado por código com testes. Não vai o extrato, não vão as notas dos
 * bens, não vão nomes de pessoas. Quem usa isto tem direito a saber o que sai
 * do servidor antes de escrever a primeira pergunta, e não depois.
 *
 * **A conversa não fica guardada.** Vive nesta página e desaparece com ela: vai
 * e volta em cada pedido, e não há tabela nenhuma. Uma tabela de conversas
 * sobre dinheiro é uma responsabilidade que esta app não precisa de ter.
 *
 * **Os números são os da app, não os do modelo.** Ele recebe-os feitos e
 * discute-os; não soma nem projeta. É a mesma regra da importação, onde a IA
 * escolhe colunas e não lê valores.
 */

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { conversarAction, type ConversaState } from "@/app/(app)/actions";

const vazio: ConversaState = {};

const SUGESTOES = [
  "O que é que salta à vista nos meus números?",
  "A minha dívida é cara ao pé do que tenho parado?",
  "O que muda quando a prestação subir?",
];

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A pensar…" : "Perguntar"}
    </button>
  );
}

export function ConversaFinanceira() {
  const [state, enviar] = useFormState(conversarAction, vazio);
  const mensagens = state.mensagens ?? [];
  const campo = useRef<HTMLTextAreaElement>(null);

  // Limpar o campo depois de a resposta chegar: reescrever por cima da pergunta
  // anterior é o passo seguinte que ninguém quer ter de fazer à mão.
  useEffect(() => {
    if (state.ok && campo.current) campo.current.value = "";
  }, [state]);

  return (
    <section className="card p-5">
      <p className="eyebrow mb-2">Falar sobre os teus números</p>
      <p className="mb-4 text-xs leading-snug text-fg-faint">
        Vai um resumo dos teus números — totais, dívidas com taxa e prestação,
        médias por categoria, evolução — já calculado aqui. Não vão as despesas
        uma a uma, nem as notas dos bens, nem nomes de ninguém. Os números são os
        da app: o modelo discute-os, não os calcula. A conversa não fica
        guardada, desaparece quando saíres da página.
      </p>

      {mensagens.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {mensagens.map((m, i) => (
            <li
              key={`${i}-${m.content.slice(0, 24)}`}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-panel2 px-3.5 py-2.5 text-sm text-fg"
                  : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm border border-hair px-3.5 py-2.5 text-sm leading-relaxed text-fg-muted"
              }
            >
              {m.content.split("\n").map((linha, k) => (
                <span key={k} className="block">
                  {linha || " "}
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {SUGESTOES.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  if (campo.current) {
                    campo.current.value = s;
                    campo.current.focus();
                  }
                }}
                className="rounded-full border border-hair px-2.5 py-1 text-xs text-fg-muted transition hover:border-fg/30 hover:text-fg"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={enviar} className="space-y-2">
        {/* A conversa anterior volta a subir em cada pergunta: é o que faz as
            respostas seguintes saberem do que se estava a falar, e é o preço de
            não haver tabela nenhuma. */}
        <input type="hidden" name="historico" value={JSON.stringify(mensagens)} />
        <label className="sr-only" htmlFor="conversa-pergunta">
          A tua pergunta
        </label>
        <textarea
          ref={campo}
          id="conversa-pergunta"
          name="pergunta"
          rows={2}
          maxLength={2000}
          required
          placeholder="Pergunta o que quiseres sobre estes números."
          className="input resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          <Enviar />
          {state.error ? (
            <p role="alert" className="text-xs text-debt">{state.error}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
