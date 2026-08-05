/**
 * A marca, em desenho: um disco rachado ao meio.
 *
 * É o mesmo desenho do ícone da app, aqui em componente para aparecer ao lado
 * do nome no cabeçalho. Herda a cor do texto, por isso funciona nos dois temas
 * sem ter de saber qual está ativo.
 */
export function BrandMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" aria-hidden>
      <path d="M240 106a150 150 0 0 0 0 300Z" transform="translate(-14 -16)" />
      <path d="M272 106a150 150 0 0 1 0 300Z" transform="translate(14 16)" />
    </svg>
  );
}
