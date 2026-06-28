import { isDevLoginEnabled } from "@/lib/env";
import { householdUsers } from "@/lib/users";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar — Finanças" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const devUsers = isDevLoginEnabled() ? householdUsers() : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-100 p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl">
            <span aria-hidden>💸</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Finanças</h1>
          <p className="mt-1 text-sm text-slate-500">
            Despesas partilhadas — acesso privado.
          </p>
        </div>

        {searchParams.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Não foi possível entrar. Só os emails autorizados têm acesso.
          </p>
        ) : null}

        <LoginForm
          callbackUrl={searchParams.callbackUrl ?? "/dashboard"}
          devUsers={devUsers}
        />

        <p className="mt-6 text-center text-xs text-slate-400">
          Só os dois emails autorizados conseguem entrar.
        </p>
      </div>
    </main>
  );
}
