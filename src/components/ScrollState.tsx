"use client";

import { useEffect, useRef } from "react";

/**
 * Diz ao `<html>` se a página já saiu do topo, para o cabeçalho ganhar fundo.
 *
 * Uma sentinela de 1px observada, e não um ouvinte de `scroll`: o ouvinte
 * dispara dezenas de vezes por segundo e obriga a ler o `scrollY` (que força
 * o browser a recalcular a página) em cada uma. Isto dispara duas vezes, uma
 * quando se sai do topo e outra quando se volta.
 *
 * O cabeçalho arranca sem fundo nem desfoque: um `backdrop-filter` de largura
 * total no primeiro pintar é caro, sobretudo em Android.
 */
export function ScrollState() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) root.removeAttribute("data-scrolled");
        else root.setAttribute("data-scrolled", "");
      },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      root.removeAttribute("data-scrolled");
    };
  }, []);

  return <div ref={ref} aria-hidden className="pointer-events-none absolute top-6 h-px w-full" />;
}
