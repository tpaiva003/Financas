/**
 * Onde é que o botão flutuante de adicionar faz sentido.
 *
 * Separado do componente para ter testes: a regra é pequena mas cresceu duas
 * vezes por causa de defeitos reais, e o que cresce assim merece ser fixado.
 *
 * Adiciona sempre uma DESPESA, e por isso só aparece onde despesas são o
 * assunto. No património ou nos rendimentos era enganador: parecia que ia
 * acrescentar um bem ou um ordenado. E nas páginas que JÁ SÃO um formulário não
 * leva a lado nenhum, além de tapar o campo que a pessoa está a preencher.
 */
const HIDDEN_ON = ["/patrimonio", "/rendimentos", "/despesas/nova", "/importar", "/ambientes/novo"];

export function showsQuickAdd(pathname: string): boolean {
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  // Qualquer página de edição de despesa é também um formulário.
  if (/^\/despesas\/[^/]+\/editar$/.test(pathname)) return false;
  return true;
}
