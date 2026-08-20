"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { SECTIONS, isSectionActive, moreLinks } from "@/lib/nav";

/**
 * Topo da app: quatro secções fixas e um menu "Mais" para o resto.
 *
 * A regra é o topo não crescer com as funcionalidades. Tudo o que é ocasional
 * (acertos, ambiente) ou administrativo (mensagens, consola) fica no menu, e as
 * páginas de cada secção aparecem por dentro dela, não aqui.
 */
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
  const [open, setOpen] = useState(false);

  // Submitters só submetem despesas: não têm secções nem menu.
  if (isSubmitter) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/despesas"
          className="rounded-full bg-panel2 px-3.5 py-1.5 text-sm text-fg"
        >
          Despesas
        </Link>
        <SignOut />
      </div>
    );
  }

  const extra = moreLinks({ isAdmin });
  const moreBadge = isAdmin ? unreadMessages : 0;

  return (
    <div className="flex items-center gap-1.5">
      {/* Aprovações pendentes: entra e sai conforme houver trabalho à espera. */}
      {pendingApprovals > 0 ? (
        <Link
          href="/aprovacoes"
          className="flex items-center gap-1.5 rounded-full border border-debt/30 bg-debt/10 px-2.5 py-1 text-xs font-medium text-debt transition hover:bg-debt/20"
          aria-label={`${pendingApprovals} despesas por aprovar`}
        >
          ✓ {pendingApprovals}
        </Link>
      ) : null}

      <nav className="mr-1 hidden items-center gap-1 sm:flex">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              isSectionActive(s, pathname) ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* Mais: o que não merece um lugar fixo no topo. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          Mais
          {moreBadge > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-credit px-1 text-[11px] font-semibold leading-none text-bg">
              {moreBadge}
            </span>
          ) : null}
        </button>

        {open ? (
          <div role="menu" className="menu absolute right-0 top-full z-30 mt-1.5 w-52">
            <p className="menu-head">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-panel2 font-mono text-[11px] text-fg">
                {userName.charAt(0)}
              </span>
              {userName}
            </p>
            {extra.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" className="menu-item">
                {l.label}
                {l.href === "/mensagens" && unreadMessages > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-credit px-1 text-[11px] font-semibold leading-none text-bg">
                    {unreadMessages}
                  </span>
                ) : null}
              </Link>
            ))}
            {/* "Sair" separa-se por um espaço, não por um fio. */}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              role="menuitem"
              className="menu-item mt-1"
            >
              Sair
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SignOut() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-full px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      Sair
    </button>
  );
}
