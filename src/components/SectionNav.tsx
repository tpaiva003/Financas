"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionOf } from "@/lib/nav";

/**
 * Páginas de uma secção, mostradas por dentro dela.
 *
 * É isto que permite ao topo ficar com quatro entradas: "Importar" e
 * "Recorrentes" deixam de disputar espaço no menu principal e aparecem onde
 * fazem sentido, ao lado da lista de despesas.
 */
export function SectionNav() {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const children = section?.children;
  if (!children || children.length < 2) return null;

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {children.map((c) => {
        const active = pathname === c.href || pathname.startsWith(`${c.href}/`);
        return (
          <Link
            key={c.href}
            href={c.href}
            aria-current={active ? "page" : undefined}
            // Só a página atual leva forma. Seis pastilhas todas contornadas
            // liam-se como uma fila de caixas vazias, e era mais uma coisa a
            // desenhar linhas por todo o lado.
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 ${
              active
                ? "bg-panel2 text-fg"
                : "text-fg-muted hover:bg-panel2/50 hover:text-fg"
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
