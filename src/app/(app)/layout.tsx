import Link from "next/link";
import { requireUser } from "@/lib/session";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <span aria-hidden>💸</span> Finanças
          </Link>
          <AppNav userName={user.name} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-28 pt-5 sm:pb-10">{children}</main>

      {/* Botão flutuante "adicionar despesa" — sempre a um toque (REQ-MAN-2). */}
      <Link
        href="/despesas/nova"
        className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-3xl text-white shadow-lg transition hover:bg-brand-700 sm:bottom-8"
        aria-label="Adicionar despesa"
      >
        +
      </Link>

      {/* Navegação inferior (mobile). */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-safe sm:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-around">
          <BottomLink href="/dashboard" label="Saldo" icon="⚖️" />
          <BottomLink href="/despesas" label="Despesas" icon="📋" />
          <BottomLink href="/acertos" label="Acertos" icon="🤝" />
        </div>
      </nav>
    </div>
  );
}

function BottomLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-600"
    >
      <span aria-hidden className="text-lg">
        {icon}
      </span>
      {label}
    </Link>
  );
}
