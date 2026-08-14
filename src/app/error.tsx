"use client";

/**
 * O que se vê quando alguma coisa rebenta dentro da app.
 *
 * Sem este ficheiro, qualquer `throw` num componente de servidor dava o ecrã de
 * erro cru do Next — que em produção é um "Application error" sem contexto e,
 * pior, sem caminho de volta. E a camada de dados atira `new Error(...)` sempre
 * que o Supabase responde mal, ou seja, uma falha de rede bastava.
 *
 * O que NÃO se mostra aqui: a mensagem do erro. Ela vem da base de dados e pode
 * trazer nomes de colunas e fragmentos de consulta. Fica o `digest`, que é o que
 * permite encontrar o erro nos registos sem expor nada.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Alguma coisa correu mal</h1>
      <p className="mt-3 text-sm text-fg-muted">
        Não conseguimos desenhar esta página. Os teus dados estão como estavam —
        nada foi gravado nem apagado por causa disto.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Tentar outra vez
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Voltar ao início
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 font-mono text-[11px] text-fg-muted">
          Referência: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
