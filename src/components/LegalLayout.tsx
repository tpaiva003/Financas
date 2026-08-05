import Link from "next/link";

/**
 * Moldura das páginas legais (privacidade, termos).
 *
 * São públicas de propósito: a Google exige que estejam acessíveis sem sessão
 * para aprovar o ecrã de consentimento do SSO, e faz sentido que quem está a
 * decidir se cria conta as possa ler antes de a criar.
 */
export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-[15px] font-semibold tracking-tight">Rachar</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint sm:inline">
              Contas à moda do Porto
            </span>
          </Link>
          <Link href="/login" className="btn-secondary">Entrar</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="eyebrow">Atualizado a {updated}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tightest">{title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">{intro}</p>
        <div className="mt-10 space-y-9">{children}</div>
      </main>

      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
          <Link href="/" className="hover:text-fg-muted">Início</Link>
          <Link href="/privacidade" className="hover:text-fg-muted">Privacidade</Link>
          <Link href="/termos" className="hover:text-fg-muted">Termos</Link>
          <a href="mailto:ola@rachar.pt" className="hover:text-fg-muted">ola@rachar.pt</a>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-fg-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}
