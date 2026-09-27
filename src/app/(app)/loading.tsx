/**
 * O que se vê enquanto uma página da app se desenha.
 *
 * Todas as páginas da app são renderizadas no servidor e vão à base de dados
 * antes de mostrar seja o que for. Sem isto, tocar num item do menu não dava
 * sinal nenhum durante esse tempo — no telemóvel, com rede fraca, parecia que o
 * toque não tinha sido registado e a pessoa carregava outra vez.
 *
 * É de propósito um esqueleto e não um "a carregar…": ocupa o sítio de onde o
 * conteúdo vai aparecer, por isso a página não salta quando ele chega.
 */
export default function ACarregar() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar…</span>
      <div className="h-7 w-40 animate-pulse rounded-lg bg-panel2" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-panel2" />
        ))}
      </div>
    </div>
  );
}
