"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Saldo" },
  { href: "/despesas", label: "Despesas" },
  { href: "/acertos", label: "Acertos" },
];

export function AppNav({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <nav className="mr-2 hidden items-center gap-1 sm:flex">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <span className="hidden text-sm text-slate-400 sm:inline">{userName}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Sair
      </button>
    </div>
  );
}
