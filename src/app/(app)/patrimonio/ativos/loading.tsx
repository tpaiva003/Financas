/**
 * A espera entre a lista de ativos e a ficha de um ativo.
 *
 * O `patrimonio/loading.tsx` responde ao entrar na secção; ao descer da lista
 * para `/patrimonio/ativos/[id]` — a página com mais leituras da app — era
 * preciso uma fronteira AQUI, senão o toque num investimento não fazia nada
 * durante segundos. Ver o modelo em `patrimonio/loading.tsx`.
 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar o ativo…</span>

      <div>
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-3 h-8 w-64 max-w-full rounded bg-panel2" />
        <div className="mt-2 h-4 w-48 rounded bg-panel2/60" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[4.5rem] p-4">
            <div className="h-3 w-16 rounded bg-panel2" />
            <div className="mt-2 h-4 w-20 rounded bg-panel2/60" />
          </div>
        ))}
      </div>

      <div className="card space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="h-4 w-40 max-w-full rounded bg-panel2" />
            <div className="h-4 w-20 rounded bg-panel2/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
