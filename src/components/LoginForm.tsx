"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    void signIn("password", { email, password, callbackUrl });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="tu@exemplo.pt"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Palavra-chave</label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          placeholder="••••••••"
          className="input"
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "A entrar…" : "Entrar"}
      </button>
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-faint">
        Primeira vez? A palavra-chave que escreveres fica a ser a tua.
      </p>
    </form>
  );
}
