import Image from "next/image";

/**
 * Molduras de aparelho para as capturas de ecrã.
 *
 * O ecrã por dentro é sempre de noite (classe `.screen`), mesmo quando a
 * página está no tema de dia: um telemóvel escuro em cima de papel é
 * exatamente o que um telemóvel é, e uma captura escura a flutuar sem moldura
 * sobre fundo claro fica um buraco preto no meio da página.
 *
 * O rácio vive no elemento de fora, para a moldura ocupar o lugar dela antes
 * de a imagem chegar e a página não saltar.
 */

export function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[390/844] rounded-[2.25rem] p-[6px] ${className}`}
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 40%)",
        boxShadow: "var(--shadow-device), 0 0 0 1px var(--card-ring)",
      }}
    >
      <div className="screen relative h-full w-full overflow-hidden rounded-[1.9rem]">
        {/* Ilha da câmara: sem ela a moldura lê-se como um retângulo qualquer. */}
        <div className="absolute left-1/2 top-2 z-10 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-black/80" />
        {children}
      </div>
    </div>
  );
}

export function BrowserFrame({
  children,
  url = "rachar.pt",
  className = "",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{
        background: "var(--card-fill)",
        boxShadow: "var(--shadow-device), 0 0 0 1px var(--card-ring)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-fg-faint/40" />
          <span className="h-2 w-2 rounded-full bg-fg-faint/40" />
          <span className="h-2 w-2 rounded-full bg-fg-faint/40" />
        </span>
        <span className="truncate font-mono text-[10px] tracking-tight text-fg-faint">{url}</span>
      </div>
      {/* Esta linha é anatomia da moldura, não uma divisória entre blocos. */}
      <div className="screen border-t border-hair2">{children}</div>
    </div>
  );
}

/**
 * Uma captura de ecrã da app.
 *
 * `loading="lazy"` em todas: nenhuma está acima da dobra (o herói é HTML), e
 * assim o browser também não vai buscar a versão que está escondida no
 * tamanho de ecrã atual.
 */
export function Shot({
  src,
  alt,
  width,
  height,
  className = "",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      sizes="(max-width: 767px) 90vw, 740px"
      className={`h-auto w-full ${className}`}
    />
  );
}
