"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Botão flutuante de adicionar.
 *
 * Adiciona sempre uma DESPESA, e por isso só aparece onde despesas são o
 * assunto. No património ou nos rendimentos era enganador: parecia que ia
 * acrescentar um bem ou um ordenado, e essas páginas já têm o seu formulário à
 * mão. Um atalho que faz outra coisa do que aparenta é pior do que não existir.
 */
const HIDDEN_ON = ["/patrimonio", "/rendimentos"];

export function QuickAdd() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <Link
      href="/despesas/nova"
      className="group fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-fg text-bg shadow-glow transition hover:scale-105 active:scale-95 sm:bottom-10"
      aria-label="Adicionar despesa"
      title="Adicionar despesa"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
