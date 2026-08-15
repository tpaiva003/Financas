"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionOf } from "@/lib/nav";

/**
 * Um separador da barra de baixo (telemóvel).
 *
 * Passa a saber-se qual está ativo. Não é enfeite: a barra tinha cinco ícones
 * todos iguais e, a meio de uma navegação, não havia forma de dizer onde se
 * estava sem ler o título da página.
 *
 * A regra de "ativo" é a mesma do topo (`sectionOf`), para os dois menus
 * concordarem: quem está em "Importar" vê a secção Movimentos acesa nos dois
 * sítios, e não uma coisa em cima e outra em baixo.
 */
export function BottomLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const active = section
    ? section.href === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors duration-200 ${
        active ? "text-fg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {/* Um ponto, não um sublinhado: mais uma linha aqui era o oposto do que
          se quer, e o ponto lê-se à mesma de relance. */}
      <span
        aria-hidden
        className={`absolute top-0.5 h-1 w-1 rounded-full bg-fg transition-opacity duration-200 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <span aria-hidden>{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{label}</span>
    </Link>
  );
}
