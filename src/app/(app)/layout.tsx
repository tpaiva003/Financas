import Link from "next/link";
import { isAdmin } from "@/lib/users";
import { getSpaceContext } from "@/lib/space";
import { AppNav } from "@/components/AppNav";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSpaceContext();
  const user = ctx.user;
  const admin = isAdmin(user.id);

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-hair bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-display text-[15px] font-semibold tracking-tight">
              Finanças
            </Link>
            {ctx.space ? (
              <SpaceSwitcher
                spaces={ctx.spaces.map((s) => ({ id: s.id, name: s.name }))}
                currentId={ctx.space.id}
                currentName={ctx.space.name}
              />
            ) : null}
          </div>
          <AppNav userName={user.name} isAdmin={admin} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl animate-fade-in px-5 pb-32 pt-7 sm:pb-14">
        {children}
      </main>

      {/* Adicionar despesa — sempre a um toque (REQ-MAN-2). */}
      <Link
        href="/despesas/nova"
        className="group fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-fg text-bg shadow-glow transition hover:scale-105 active:scale-95 sm:bottom-10"
        aria-label="Adicionar despesa"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      {/* Navegação inferior (mobile). */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hair bg-bg/80 pb-safe backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          <BottomLink href="/dashboard" label="Saldo" icon={<IconBalance />} />
          <BottomLink href="/despesas" label="Despesas" icon={<IconList />} />
          <BottomLink href="/relatorios" label="Relatórios" icon={<IconChart />} />
          <BottomLink href="/acertos" label="Acertos" icon={<IconHandshake />} />
        </div>
      </nav>
    </div>
  );
}

function BottomLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-1 py-2.5 text-fg-muted transition-colors hover:text-fg"
    >
      <span aria-hidden>{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em]">{label}</span>
    </Link>
  );
}

function IconBalance() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 3v18M5 7l7-3 7 3M5 7l-2 5a3 3 0 0 0 6 0L7 7M19 7l-2 5a3 3 0 0 0 6 0l-2-5" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 3v18h18M8 16v-5M13 16V7M18 16v-8" />
    </svg>
  );
}
function IconHandshake() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="m11 17 2 2a1 1 0 0 0 3-3M3 14l3-3 5 5M14 10l3-3 4 4-3 3M7 11l-4 4" />
    </svg>
  );
}
