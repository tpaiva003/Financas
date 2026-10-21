import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A mesma forma em todos os ecrãs.
 *
 * Estes testes leem o código-fonte, como o da guarda de congelamento: a regra
 * vale para o ficheiro que ainda não existe, não só para os que existiam no
 * dia em que se corrigiu.
 *
 * As regras, e o porquê:
 *
 * 1. Uma página que se percorre com o dedo não pode medir-se em `dvh`. O
 *    `100dvh` segue a barra do browser no telemóvel: ela esconde-se a meio do
 *    scroll e a página redimensiona-se DEBAIXO do dedo — sente-se como um
 *    salto que ninguém sabe descrever. `svh` é a altura pequena, estável.
 *    (`dvh` continua certo para paineis fixos que devem crescer quando a
 *    barra desaparece, como o ChatDock — por isso a regra é só para `min-h`.)
 *
 * 2. Uma animação ligada ao scroll não pode correr num ecrã de toque: luta
 *    com o scroll do próprio browser e alguns Android achatam o `preserve-3d`
 *    (uma face do anel desaparecia aos 90°). A largura não chega como guarda —
 *    um tablet deitado tem 1024px e continua a ser um dedo. O media query da
 *    animação tem de exigir `pointer: fine`.
 */

const RAIZ = join(__dirname, "..");

function ficheiros(dir: string, extensoes: string[]): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      out.push(...ficheiros(caminho, extensoes));
      continue;
    }
    if (extensoes.some((ext) => nome.endsWith(ext))) out.push(caminho);
  }
  return out;
}

describe("a mesma forma em todos os ecrãs", () => {
  it("nenhuma página que se percorre mede a altura em dvh", () => {
    const culpados: string[] = [];
    for (const caminho of ficheiros(RAIZ, [".tsx"])) {
      const texto = readFileSync(caminho, "utf8");
      // `min-h-[100dvh]` é o contentor de uma página inteira que se percorre.
      // `max-h-*dvh` (um painel fixo que não pode sair do ecrã) fica de fora.
      if (/min-h-\[[^\]]*dvh\]/.test(texto)) {
        culpados.push(caminho.slice(RAIZ.length + 1));
      }
    }
    expect(culpados, `usa svh em vez de dvh: ${culpados.join(", ")}`).toEqual(
      [],
    );
  });

  it("toda a animação ligada ao scroll exige um rato (pointer: fine)", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    // Cada media query que envolve um bloco com `animation-timeline` tem de
    // incluir `pointer: fine`. Procura-se o media query IMEDIATAMENTE acima de
    // cada utilização — na prática, os blocos `@supports (animation-timeline)`.
    const blocos = css.split("@supports (animation-timeline: view())").slice(1);
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      const media = bloco.match(/@media[^{]+/)?.[0] ?? "";
      expect(
        media.includes("pointer: fine"),
        `um bloco de animation-timeline tem um @media sem "pointer: fine": ${media.trim()}`,
      ).toBe(true);
    }
  });
});
