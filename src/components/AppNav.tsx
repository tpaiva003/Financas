"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const BASE_LINKS = [
  { href: "/dashboard", label: "Saldo" },
  { href: "/despesas", label: "Despesas" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/acertos", label: "Acertos" },
];

export function AppNav({ userName, isAdmin = false }: { userName: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const LINKS = isAdmin
    ? [...BASE_LINKS, { href: "/mensagens", label: "Mensagens" }]
    : BASE_LINKS;

  return (
    <div className="flex items-center gap-1.5">
      <nav className="mr-2 hidden items-center gap-1 sm:flex">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                active ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <span className="hidden items-center gap-2 pl-1 text-sm text-fg-muted sm:flex">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-hair font-mono text-[11px] text-fg">
          {userName.charAt(0)}
        </span>
      </span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-full px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        Sair
      </button>
    </div>
  );
}
