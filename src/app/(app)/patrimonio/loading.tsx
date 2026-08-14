/**
 * O que se vê enquanto uma página do património se prepara.
 *
 * **Porque é que isto faltava e custou caro.** As páginas do património leem
 * bens, movimentos, desdobramentos, anexos e cotações antes de desenharem seja o
 * que for. Sem uma fronteira de espera **dentro** desta secção, o Next segura a
 * navegação até o servidor responder: carrega-se em "Ativos" e **não acontece
 * nada** — o menu não muda, a página não muda, e a leitura óbvia é que o clique
 * se perdeu. Então carrega-se outra vez, e a segunda vez também não faz nada.
 *
 * Havia um `loading.tsx` no `(app)`, mas está acima de todas estas rotas: ao
 * trocar entre irmãs (`/patrimonio` → `/patrimonio/ativos`) não era ele que
 * respondia. Este está no sítio certo — ao pé das rotas que demoram.
 *
 * **Tem a forma do que vai aparecer**, e não um símbolo a girar: o cabeçalho no
 * mesmo sítio, os cartões com a mesma altura. Assim a página não salta quando
 * os dados chegam, e quem está a olhar percebe que já está no ecrã certo.
 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar o património…</span>

      <div>
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="mt-3 h-8 w-48 rounded bg-panel2" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-panel2/60" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[4.5rem] p-4">
            <div className="h-3 w-16 rounded bg-panel2" />
            <div className="mt-2 h-4 w-20 rounded bg-panel2/60" />
          </div>
        ))}
      </div>

      <div className="card p-6">
        <div className="h-3 w-32 rounded bg-panel2" />
        <div className="mt-3 h-12 w-56 max-w-full rounded bg-panel2" />
        <div className="mt-3 h-4 w-64 max-w-full rounded bg-panel2/60" />
      </div>

      <div className="card space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="h-3 w-24 rounded bg-panel2" />
              <div className="h-3 w-16 rounded bg-panel2/60" />
            </div>
            <div className="h-2 w-full rounded-full bg-panel2/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
