/**
 * A espera dos relatórios, no sítio certo.
 *
 * O `SectionNav` está sempre à vista e os relatórios leem todas as despesas
 * antes de desenharem: sem fronteira AQUI, trocar de relatório parecia um
 * clique perdido (ver o `patrimonio/loading.tsx`, que é o modelo disto).
 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar os relatórios…</span>

      <div>
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-3 h-8 w-56 rounded bg-panel2" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-panel2/60" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-panel2/60" />
        ))}
      </div>

      <div className="card p-6">
        <div className="h-3 w-32 rounded bg-panel2" />
        <div className="mt-4 h-48 w-full rounded bg-panel2/40" />
      </div>

      <div className="card space-y-3 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="h-3 w-28 rounded bg-panel2" />
              <div className="h-3 w-16 rounded bg-panel2/60" />
            </div>
            <div className="h-2 w-full rounded-full bg-panel2/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
