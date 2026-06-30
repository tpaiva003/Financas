import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar · Finanças" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  return (
    <main className="relative flex min-h-[100dvh] flex-col">
      {/* topo */}
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="font-display text-sm font-semibold tracking-tight">Finanças</Link>
        <span className="eyebrow hidden sm:block">Acesso privado</span>
      </header>

      {/* hero */}
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <p className="eyebrow animate-fade-in">Área privada</p>
          <h1 className="mt-4 animate-fade-up font-display text-5xl font-semibold leading-[0.95] tracking-tightest text-balance sm:text-6xl">
            Bem-vindo
            <br />
            <span className="text-fg-muted">de volta.</span>
          </h1>
          <p
            className="mt-5 max-w-sm animate-fade-up text-[15px] leading-relaxed text-fg-muted"
            style={{ animationDelay: "60ms" }}
          >
            Entra para ver o saldo e registar despesas. O acesso é restrito.
          </p>

          <div className="mt-10 animate-fade-up" style={{ animationDelay: "120ms" }}>
            {searchParams.error ? (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt"
              >
                Não foi possível entrar. Confirma o email e a palavra-chave, ou
                se o teu email tem acesso.
              </p>
            ) : null}

            <LoginForm callbackUrl={searchParams.callbackUrl ?? "/dashboard"} />
          </div>
        </div>
      </div>

      {/* rodapé */}
      <footer className="px-6 pb-8 sm:px-10">
        <div className="flex items-center gap-2 border-t border-hair2 pt-6">
          <span className="h-1.5 w-1.5 rounded-full bg-credit" />
          <p className="eyebrow">Encriptado · Allow-list de 2 emails</p>
        </div>
      </footer>
    </main>
  );
}
