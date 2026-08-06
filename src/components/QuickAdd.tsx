"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { showsQuickAdd } from "./quick-add-rules";

/** Botão flutuante de adicionar. A regra de onde aparece vive em `quick-add-rules`. */
export function QuickAdd() {
  const pathname = usePathname();
  if (!showsQuickAdd(pathname)) return null;

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
