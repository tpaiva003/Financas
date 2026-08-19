/**
 * A espera das mensagens e dos pedidos de ajuda — a fronteira do `(app)` não
 * responde ao abrir um pedido a partir da lista. Ver `patrimonio/loading.tsx`.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar as mensagens…</span>

      <div>
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-3 h-8 w-48 rounded bg-panel2" />
      </div>

      <div className="card divide-y divide-hair2 p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="px-3 py-3">
            <div className="h-4 w-56 max-w-full rounded bg-panel2" />
            <div className="mt-1.5 h-3 w-full max-w-md rounded bg-panel2/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
