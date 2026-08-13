import Link from "next/link";
import { isAdmin } from "@/lib/users";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SectionNav } from "@/components/SectionNav";
import { BrandMark } from "@/components/BrandMark";
import { QuickAdd } from "@/components/QuickAdd";
import { BottomLink } from "@/components/BottomLink";
import { PageTransition } from "@/components/PageTransition";
import { ScrollState } from "@/components/ScrollState";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSpaceContext();
  const user = ctx.user;
  const admin = isAdmin(user.id);
  const isSubmitter = ctx.viewerRole === "submitter";
  const repo = getRepository();
  const unreadMessages = admin ? await repo.countUnreadContactMessages() : 0;
  const pendingApprovals = isSubmitter ? 0 : await repo.countPendingApprovals(ctx.space.id);

  return (
    <div data-app className="min-h-[100dvh]">
      <ScrollState />
      {/*
        Sem borda: o cabeçalho ganha fundo e sombra quando a página sai do
        topo, e no topo não há linha nenhuma a cortar o ecrã ao meio.
      */}
      <header data-sticky className="sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight"
            >
              <BrandMark />
              Rachar
            </Link>
            {ctx.space ? (
              <SpaceSwitcher
                spaces={ctx.spaces.map((s) => ({ id: s.id, name: s.name }))}
                currentId={ctx.space.id}
                currentName={ctx.space.name}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AppNav
              userName={user.name}
              isAdmin={admin}
              isSubmitter={isSubmitter}
              unreadMessages={unreadMessages}
              pendingApprovals={pendingApprovals}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-32 pt-7 sm:pb-14">
        {/* Páginas da secção atual (ex.: Lista, Importar, Recorrentes). */}
        <div className="mb-6 empty:hidden">
          <SectionNav />
        </div>
        {/* Anima a cada mudança de rota, e não só ao carregar a app. */}
        <PageTransition>{children}</PageTransition>
      </main>

      <QuickAdd />

      {/* Navegação inferior (mobile). Sombra a subir, em vez de uma borda. */}
      <nav data-sticky className="fixed inset-x-0 bottom-0 z-20 bg-bg/80 pb-safe backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {isSubmitter ? (
            <BottomLink href="/despesas" label="Despesas" icon={<IconList />} />
          ) : (
            <>
              {/* As mesmas secções do topo, para o mapa mental ser um só. */}
              <BottomLink href="/dashboard" label="Saldo" icon={<IconBalance />} />
              <BottomLink href="/despesas" label="Movimentos" icon={<IconList />} />
              <BottomLink href="/relatorios" label="Análise" icon={<IconChart />} />
              <BottomLink href="/patrimonio" label="Património" icon={<IconWallet />} />
              <BottomLink href="/acertos" label="Acertos" icon={<IconHandshake />} />
            </>
          )}
        </div>
      </nav>
    </div>
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
function IconRepeat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M21 14h-4a2 2 0 0 1 0-4h4z" />
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
