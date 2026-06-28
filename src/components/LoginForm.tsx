"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { HouseholdUser } from "@/lib/users";

export function LoginForm({
  callbackUrl,
  devUsers,
}: {
  callbackUrl: string;
  devUsers: HouseholdUser[];
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const start = (provider: string, options?: Record<string, unknown>) => {
    setLoading(provider);
    void signIn(provider, { callbackUrl, ...options });
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-secondary w-full justify-between"
        disabled={loading !== null}
        onClick={() => start("google")}
      >
        <span className="flex items-center gap-3">
          <GoogleIcon />
          Continuar com Google
        </span>
        <Arrow />
      </button>

      <button
        type="button"
        className="btn-secondary w-full justify-between"
        disabled={loading !== null}
        onClick={() => start("microsoft-entra-id")}
      >
        <span className="flex items-center gap-3">
          <MicrosoftIcon />
          Continuar com Microsoft
        </span>
        <Arrow />
      </button>

      {devUsers.length > 0 ? (
        <div className="!mt-6 space-y-2">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hair" />
            <span className="eyebrow">Modo de desenvolvimento</span>
            <span className="h-px flex-1 bg-hair" />
          </div>
          {devUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="btn-ghost w-full justify-start rounded-xl border border-dashed border-hair px-4 py-2.5 hover:border-fg/30"
              disabled={loading !== null}
              onClick={() => start("dev-login", { email: u.email })}
            >
              Entrar como <span className="font-medium text-fg">{u.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}
