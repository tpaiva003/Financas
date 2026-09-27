"use client";

/**
 * Uma caixa que se abre por cima de tudo e espera por uma resposta.
 *
 * **Para o que não pode passar despercebido.** A app resolve quase tudo com
 * painéis que se abrem na própria página, e é o que deve ser: interromper por
 * hábito ensina a fechar sem ler. Isto fica para as duas ou três coisas que
 * mudam alguma coisa a sério e não têm volta.
 *
 * **O que uma caixa destas tem de ter para não ser uma armadilha:** fecha-se
 * com o Escape, fecha-se a carregar fora dela, e o foco entra nela quando abre
 * — senão quem navega por teclado continua a carregar em botões que estão por
 * baixo, sem os ver.
 */

import { useEffect, useRef } from "react";

export function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    painel.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    /**
     * A página por baixo não rola enquanto isto está aberto.
     *
     * Sem isto, no telemóvel o dedo arrasta a página de trás e a caixa fica
     * a flutuar sobre conteúdo que já não é o que estava a ser falado.
     */
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={aoFechar}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        // O clique de dentro não conta como clique fora.
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[85dvh] w-full max-w-md overflow-y-auto p-5 outline-none"
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}
