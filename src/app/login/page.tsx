import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { FilaDeEspera } from "@/components/FilaDeEspera";

export const metadata = { title: "Entrar · Rachar" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string; cheio?: string; convite?: string };
}) {
  // A porta fechada do registo: houve vaga a menos, não erro a mais. Quem cai
  // aqui vinha registar-se e encontrou o tecto do dia — a resposta útil não é
  // "tenta amanhã", é guardar o email e avisar quando for a vez.
  if (searchParams.cheio === "1") {
    return (
      <main className="relative flex min-h-[100svh] flex-col">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-sm font-semibold tracking-tight">Rachar</span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-md">
            <p className="eyebrow animate-fade-in">Registo</p>
            <h1 className="mt-4 animate-fade-up font-display text-5xl font-semibold leading-[0.95] tracking-tightest text-balance">
              Por hoje
              <br />
              <span className="text-fg-muted">está cheio.</span>
            </h1>
            <p className="mt-5 max-w-sm animate-fade-up text-[15px] leading-relaxed text-fg-muted">
              Abrimos poucas contas por dia, de propósito: é o que nos deixa
              cuidar bem de cada uma. Deixa o teu email e avisamos-te quando for
              a tua vez.
            </p>
            <div className="mt-8 animate-fade-up" style={{ animationDelay: "120ms" }}>
              <FilaDeEspera source="registo-cheio" />
            </div>
            <p className="mt-6 text-xs text-fg-faint">
              Já tens conta?{" "}
              <Link href="/login" className="underline hover:text-fg-muted">
                Entra por aqui.
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="relative flex min-h-[100svh] flex-col">
      {/* topo */}
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-sm font-semibold tracking-tight">Rachar</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint sm:inline">
            Contas à moda do Porto
          </span>
        </Link>
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
            {searchParams.convite === "aceite" ? (
              <p className="mb-4 rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm text-credit">
                Conta criada. Entra com o email do convite e a palavra-chave que
                escolheste.
              </p>
            ) : null}
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
          {/* Já não são "2 emails": a app tem contas próprias e ambientes
              isolados desde que passou a multi-inquilino. */}
          <p className="eyebrow">
            Encriptado ·{" "}
            <Link href="/recuperar" className="hover:text-fg-muted">Esqueci-me</Link> ·{" "}
            <Link href="/privacidade" className="hover:text-fg-muted">Privacidade</Link> ·{" "}
            <Link href="/termos" className="hover:text-fg-muted">Termos</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
