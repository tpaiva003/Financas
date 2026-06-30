"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const BASE_LINKS = [
  { href: "/dashboard", label: "Saldo" },
  { href: "/despesas", label: "Despesas" },
  { href: "/recorrentes", label: "Recorrentes" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/acertos", label: "Acertos" },
];

export function AppNav({
  userName,
  isAdmin = false,
  isSubmitter = false,
  unreadMessages = 0,
  pendingApprovals = 0,
}: {
  userName: string;
  isAdmin?: boolean;
  isSubmitter?: boolean;
  unreadMessages?: number;
  pendingApprovals?: number;
}) {
  const pathname = usePathname();
  // Submitters só veem as Despesas (submetem). Os restantes veem tudo.
  let LINKS = isSubmitter ? [{ href: "/despesas", label: "Despesas" }] : [...BASE_LINKS];
  if (!isSubmitter && pendingApprovals > 0) {
    LINKS = [...LINKS, { href: "/aprovacoes", label: "Aprovações" }];
  }
  if (!isSubmitter && isAdmin) {
    LINKS = [...LINKS, { href: "/mensagens", label: "Mensagens" }];
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Atalho mensagens por ler — visível no topo também em mobile (admin). */}
      {isAdmin && unreadMessages > 0 ? (
        <Link
          href="/mensagens"
          className="flex items-center gap-1.5 rounded-full border border-credit/30 bg-credit/10 px-2.5 py-1 text-xs font-medium text-credit transition hover:bg-credit/20 sm:hidden"
          aria-label={`${unreadMessages} mensagens por ler`}
        >
          <IconMail />
          {unreadMessages}
        </Link>
      ) : null}

      <nav className="mr-2 hidden items-center gap-1 sm:flex">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          const badge =
            l.href === "/mensagens" ? unreadMessages : l.href === "/aprovacoes" ? pendingApprovals : 0;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                active ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {l.label}
              {badge > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-credit px-1 text-[11px] font-semibold leading-none text-bg">
                  {badge}
                </span>
              ) : null}
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

function IconMail() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
