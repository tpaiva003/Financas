"use client";

/**
 * O chat, no canto, em todas as páginas.
 *
 * **Porque é que vive no layout e não numa página.** No App Router, o layout
 * não é remontado quando se muda de rota — só o `children` é. Pôr o chat aqui
 * é o que faz a conversa **sobreviver à navegação** sem uma linha de código
 * para isso: quem perguntou "o que é isto?" no património pode abrir as
 * despesas e continuar a falar. Se estivesse dentro de uma página, cada
 * navegação apagava tudo.
 *
 * **O que ele sabe.** Um resumo do ambiente inteiro — património, dívidas com
 * taxa e prestação, despesa média por categoria, rendimento, evolução, e o
 * saldo entre as pessoas — calculado no servidor a cada pergunta, por código
 * com testes. Vai também a página onde a pessoa está, para se poder falar do
 * que ela tem à frente.
 *
 * **A conversa não fica guardada.** Vive nesta aba e vai e volta em cada
 * pedido. Fechar a app apaga-a.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { conversarAction, type ConversaState } from "@/app/(app)/actions";

const vazio: ConversaState = {};

const SUGESTOES = [
  "O que é que salta à vista nos meus números?",
  "Quem me deve o quê?",
  "A minha dívida é cara ao pé do que tenho parado?",
];

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary shrink-0 text-xs" disabled={pending}>
      {pending ? "A pensar…" : "Enviar"}
    </button>
  );
}

/**
 * A resposta chega como texto. Os parágrafos são separados por linhas em
 * branco; não se interpreta markdown, que num painel estreito faz mais mal do
 * que bem.
 */
function Texto({ children }: { children: string }) {
  return (
    <>
      {children.split("\n").map((linha, i) => (
        <span key={i} className="block">
          {linha || " "}
        </span>
      ))}
    </>
  );
}

export function ChatDock() {
  const [aberto, setAberto] = useState(false);
  const [state, enviar] = useFormState(conversarAction, vazio);
  const pathname = usePathname();
  const campo = useRef<HTMLTextAreaElement>(null);
  const fundo = useRef<HTMLDivElement>(null);

  const mensagens = state.mensagens ?? [];
  const porResponder = mensagens.length > 0 && mensagens[mensagens.length - 1]!.role === "user";

  // Limpar o campo e descer ao fim quando a conversa cresce.
  useEffect(() => {
    if (state.ok && campo.current) campo.current.value = "";
    fundo.current?.scrollIntoView({ block: "end" });
  }, [state]);

  // Fechar com Escape é o que toda a gente tenta primeiro num painel destes.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  return (
    <>
      {/*
        Por cima do botão de adicionar despesa, que já ocupa o canto. Dois
        botões redondos empilhados, o de baixo é o que se usa mais vezes.
      */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="chat-dock"
        className="fixed bottom-[10.5rem] right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-hair bg-panel text-fg shadow-glow transition hover:scale-105 active:scale-95 sm:bottom-[7rem]"
        title="Falar sobre os teus números"
      >
        <span className="sr-only">Falar sobre os teus números</span>
        {aberto ? <IconFechar /> : <IconChat />}
        {/* Um ponto quando há conversa por ler e o painel está fechado. */}
        {!aberto && mensagens.length > 0 ? (
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-credit" aria-hidden />
        ) : null}
      </button>

      {aberto ? (
        <div
          id="chat-dock"
          role="dialog"
          aria-label="Falar sobre os teus números"
          className="fixed inset-x-3 bottom-24 z-40 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-hair bg-panel shadow-glow sm:inset-x-auto sm:right-5 sm:bottom-[7rem] sm:w-[26rem]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-hair px-4 py-3">
            <div className="min-w-0">
              <p className="eyebrow">Os teus números</p>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">
                Sabe o teu património, as dívidas, a despesa por categoria e o
                saldo entre vocês. Os números são os da app — não os calcula.
                A conversa não fica guardada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="btn-ghost shrink-0 px-2 text-xs"
            >
              Fechar
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {mensagens.length === 0 ? (
              <ul className="flex flex-wrap gap-1.5">
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
            ) : (
              <ul className="space-y-2.5">
                {mensagens.map((m, i) => (
                  <li
                    key={`${i}-${m.content.slice(0, 24)}`}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-panel2 px-3 py-2 text-sm text-fg"
                        : "mr-auto max-w-[92%] rounded-2xl rounded-bl-sm border border-hair px-3 py-2 text-sm leading-relaxed text-fg-muted"
                    }
                  >
                    <Texto>{m.content}</Texto>
                  </li>
                ))}
                {/* Enquanto a resposta não chega, a última mensagem é a
                    pergunta — e sem isto o painel parecia ter-se esquecido. */}
                {porResponder && !state.error ? (
                  <li className="mr-auto text-xs text-fg-faint">A pensar…</li>
                ) : null}
              </ul>
            )}
            <div ref={fundo} />
          </div>

          <form action={enviar} className="border-t border-hair px-4 py-3">
            {/* A conversa anterior sobe outra vez em cada pergunta: é o que faz
                a resposta seguinte saber do que se estava a falar, e é o preço
                de não haver tabela nenhuma. */}
            <input type="hidden" name="historico" value={JSON.stringify(mensagens)} />
            {/* Onde a pessoa está, para se poder falar do que ela vê. */}
            <input type="hidden" name="pagina" value={pathname ?? ""} />
            <label className="sr-only" htmlFor="chat-dock-pergunta">
              A tua pergunta
            </label>
            <div className="flex items-end gap-2">
              <textarea
                ref={campo}
                id="chat-dock-pergunta"
                name="pergunta"
                rows={1}
                maxLength={2000}
                required
                placeholder="Pergunta o que quiseres."
                className="input min-h-[2.25rem] resize-y py-1.5 text-sm"
              />
              <Enviar />
            </div>
            {state.error ? (
              <p role="alert" className="mt-2 text-xs text-debt">{state.error}</p>
            ) : null}
          </form>
        </div>
      ) : null}
    </>
  );
}

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.6-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
    </svg>
  );
}

function IconFechar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
