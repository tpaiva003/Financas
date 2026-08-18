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
      // A carcaça é escura nos dois temas, como um telemóvel a sério. Com o
      // ecrã claro lá dentro, é ela que faz a imagem ler-se como um aparelho e
      // não como um retângulo branco colado à página.
      className={`relative aspect-[390/844] rounded-[2.25rem] p-[6px] ${className}`}
      style={{
        background: "linear-gradient(160deg, var(--aparelho-topo), var(--aparelho-fundo) 45%)",
        boxShadow: "var(--shadow-device), 0 0 0 1px var(--aparelho-fio)",
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

/**
 * Uma moldura de browser à volta de uma captura da app.
 *
 * **Com `href`, a moldura inteira passa a ser um link.** Uma captura grande no
 * meio da página lê-se como se fosse a app: as pessoas carregam-lhe em cima e
 * não acontece nada, o que é um beco no sítio onde estavam mais interessadas.
 * O alvo é o mesmo do botão principal, e não a imagem em tamanho grande — quem
 * carrega aqui quer entrar, não quer ver o PNG.
 *
 * A pista de que é clicável não pode ser um `transform` no hover: estas
 * molduras levam a classe `flutua`, que anima precisamente o `transform` com o
 * scroll, e as duas coisas atropelavam-se. Fica no contorno e numa etiqueta,
 * que não disputam propriedade nenhuma com a animação.
 */
export function BrowserFrame({
  children,
  url = "rachar.pt",
  className = "",
  href,
  accao = "Ver isto na app",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
  /** Para onde vai quem carregar na moldura. Sem isto não é clicável. */
  href?: string;
  /** O que a etiqueta diz, e o nome acessível do link. */
  accao?: string;
}) {
  const moldura = (
    <div
      // A barra do browser é escura nos dois temas, como a carcaça do
      // telemóvel. Com o ecrã claro lá dentro, é ela que segura o aparelho na
      // página: sobre o papel do tema de dia, uma moldura clara à volta de um
      // ecrã claro desaparecia, e ficava um retângulo branco a flutuar.
      className={`relative overflow-hidden rounded-2xl ${href ? "" : className}`}
      style={{
        background: "linear-gradient(180deg, var(--aparelho-barra-topo), var(--aparelho-barra-fundo))",
        boxShadow: "var(--shadow-device), 0 0 0 1px var(--aparelho-fio)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
        </span>
        <span className="truncate font-mono text-[10px] tracking-tight text-white/40">{url}</span>
      </div>
      <div className="screen">{children}</div>
      {href ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-marca px-3 py-1.5 text-[11px] font-medium text-marca-fg opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {accao} →
        </span>
      ) : null}
    </div>
  );

  if (!href) return moldura;

  return (
    <a
      href={href}
      aria-label={accao}
      className={`group block rounded-2xl outline-none ring-marca-tinta/60 transition-[box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-offset-bg ${className}`}
    >
      {moldura}
    </a>
  );
}

/**
 * Uma captura de ecrã da app, nas duas versões.
 *
 * A página mostra sempre o contrário do tema em que está: escura por fora,
 * clara por dentro, e vice-versa. As duas versões vão as duas para o HTML e é o
 * CSS que esconde a que não serve (ver `[data-shot]` no globals.css).
 *
 * Podia parecer desperdício mandar as duas. Não é: `loading="lazy"` numa imagem
 * que está em `display: none` nunca chega a ser transferida, porque nunca entra
 * na vista. Quem visita paga uma; quem troca de tema paga a outra nesse
 * momento, uma vez.
 *
 * O `base` é o caminho sem sufixo, por exemplo `/landing/carteira-desktop`.
 */
export function Shot({
  base,
  alt,
  width,
  height,
  className = "",
}: {
  base: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <>
      {(["claro", "escuro"] as const).map((tema) => (
        <Image
          key={tema}
          data-shot={tema}
          src={`${base}-${tema}.webp`}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          sizes="(max-width: 767px) 90vw, 740px"
          className={`h-auto w-full ${className}`}
        />
      ))}
    </>
  );
}
