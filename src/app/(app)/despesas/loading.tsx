/**
 * A espera das despesas — a lista cresce com o histórico e a fronteira do
 * `(app)` não responde ao trocar entre irmãs (lista → nova → editar). Ver o
 * modelo em `patrimonio/loading.tsx`.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar as despesas…</span>

      <div>
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-3 h-8 w-48 rounded bg-panel2" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-32 rounded-xl bg-panel2/60" />
        ))}
      </div>

      <div className="card divide-y divide-hair2 p-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 max-w-full rounded bg-panel2" />
              <div className="mt-1.5 h-3 w-24 rounded bg-panel2/60" />
            </div>
            <div className="h-4 w-16 rounded bg-panel2/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
