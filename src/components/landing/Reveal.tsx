"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Revelação ao entrar no ecrã.
 *
 * Um observador só, partilhado por toda a página, em vez de um por elemento:
 * são umas dezenas de alvos e criar um observador para cada um é desperdício
 * puro. Cada alvo é largado (`unobserve`) mal apareça, porque a animação é
 * para acontecer uma vez.
 *
 * Se o `IntersectionObserver` não existir, marca tudo como visível de
 * imediato. O estado de partida desta animação é `opacity: 0`, e uma página
 * que fica em branco porque uma API falhou é pior do que uma página sem
 * animação nenhuma.
 */

let shared: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  shared ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-shown", "");
        shared?.unobserve(entry.target);
      }
    },
    // Dispara um pouco antes do fundo do ecrã: o elemento já está a subir
    // quando entra na vista, em vez de aparecer só depois de estar todo lá.
    { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
  );
  return shared;
}

type Tag = "div" | "section" | "ul" | "ol" | "article";

export function Reveal({
  as = "div",
  group = false,
  className,
  id,
  children,
}: {
  as?: Tag;
  /** Revela os filhos em cascata, em vez do bloco inteiro de uma vez. */
  group?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = observer();
    if (!obs) {
      el.setAttribute("data-shown", "");
      return;
    }
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);

  const Tag = as as "div";
  const flag = group ? { "data-reveal-group": "" } : { "data-reveal": "" };

  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} id={id} className={className} {...flag}>
      {children}
    </Tag>
  );
}
