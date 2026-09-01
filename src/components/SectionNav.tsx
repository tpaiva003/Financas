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
    <nav className="scroll-x flex gap-1">
      {children.map((c) => {
        /**
         * O separador raiz da secção só está ativo na correspondência exacta.
         *
         * Com `startsWith`, o "Resumo" — que aponta para `/patrimonio` — ficava
         * marcado como ativo em `/patrimonio/dividas`, ao mesmo tempo que o
         * "Dívidas". Dois separadores acesos ao mesmo tempo, e clicar no
         * "Resumo" não movia o destaque: lia-se como um botão avariado, quando
         * a navegação estava a funcionar e era a marcação que mentia.
         */
        const raizDaSeccao = c.href === section.href;
        const active = raizDaSeccao
          ? pathname === c.href
          : pathname === c.href || pathname.startsWith(`${c.href}/`);
        return (
          <Link
            key={c.href}
            href={c.href}
            // Sem prefetch, como na barra de baixo: são ligações de fundo
            // sempre visíveis, e cada prefetch era um render do servidor.
            prefetch={false}
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
