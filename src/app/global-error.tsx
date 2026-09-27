"use client";

/**
 * A última rede: um erro no próprio layout de raiz.
 *
 * Quando é o layout que rebenta, o `error.tsx` normal já não é desenhado — está
 * dentro dele. Este substitui o documento inteiro, por isso tem de trazer o seu
 * próprio `<html>` e `<body>`, e não pode contar com o CSS da app nem com as
 * fontes: são estilos em linha de propósito.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-PT">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#0b0b0c",
          color: "#f5f4f0",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <main style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>A app não conseguiu arrancar</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "#a3a29c" }}>
            Os teus dados estão a salvo. Se voltar a acontecer, tenta daqui a
            pouco.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "999px",
              border: "none",
              background: "#f5f4f0",
              color: "#0b0b0c",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Tentar outra vez
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "#6b6a65" }}>
              Referência: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
