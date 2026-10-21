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

  /**
   * Os separadores em blocos, pela ordem em que aparecem.
   *
   * Sete separadores seguidos lêem-se como uma lista de funcionalidades. Com um
   * cabeçalho pequeno à frente de cada bloco, lêem-se como duas perguntas — "o
   * que tenho" e "o que estou a decidir" — e são três de cada vez em vez de
   * sete. Onde não há `grupo` nenhum, nada muda: continua a ser uma fila só.
   */
  const blocos: { grupo: string | null; itens: typeof children }[] = [];
  for (const c of children) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.grupo === (c.grupo ?? null)) ultimo.itens.push(c);
    else blocos.push({ grupo: c.grupo ?? null, itens: [c] });
  }

  return (
    <nav className="scroll-x flex items-center gap-1">
      {blocos.map((b, i) => (
        <div key={b.grupo ?? `solto-${i}`} className="flex shrink-0 items-center gap-1">
          {b.grupo ? (
            <span
              // Cabeçalho e não separador: não se carrega nele, e por isso não
              // se parece com nada em que se possa carregar.
              className={`shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint ${
                i > 0 ? "ml-3" : ""
              }`}
            >
              {b.grupo}
            </span>
          ) : null}
          {b.itens.map((c) => {
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
        </div>
      ))}
    </nav>
  );
}
