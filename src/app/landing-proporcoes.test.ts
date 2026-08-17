import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * O feitio das peças da landing não pode depender da janela.
 *
 * Há um defeito que não dá erro nenhum: uma caixa cuja largura segue a largura
 * do ecrã e cuja altura segue a altura do ecrã. Cada eixo, sozinho, parece
 * sensato; juntos fazem a peça mudar de FORMA de computador para computador, e
 * ninguém consegue dizer porquê. Foi o que aconteceu aos cartões das frases: a
 * altura era `min(24rem, 58svh)` e a largura vinha do texto, e num telemóvel de
 * 560px de altura o cartão ficava 27px por baixo da borda do ecrã, cortado.
 *
 * A medição a sério — o browser a abrir a página em vários viewports e a ler
 * `getBoundingClientRect()` — está no `scripts/medir-landing.mjs`, que precisa
 * de um Chromium. Este teste é a rede que corre em todo o lado e sem browser
 * nenhum: garante que a REGRA continua escrita na folha de estilos.
 *
 * O que se proíbe é só a caixa do cartão. O curso do scroll (`.anel-cena`) e o
 * palco de ecrã inteiro (`.anel-palco`) leem o ecrã de propósito, e devem.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

/** Unidades que fazem uma medida depender do tamanho da janela. */
const UNIDADES_DE_JANELA = /\b\d*\.?\d+(vh|vw|svh|svw|dvh|dvw|lvh|lvw)\b/;

/** Propriedades que definem a CAIXA de uma peça, e não o que está lá dentro. */
const PROPRIEDADES_DE_CAIXA =
  /^\s*(width|height|min-width|min-height|max-width|max-height|inset|top|bottom|left|right|--anel-raio)\s*:/;

/**
 * Todos os blocos de um seletor exato, com as chavetas contadas à mão.
 *
 * Exato importa: `.anel` não pode apanhar `.anel-frase`, e `.anel-frase` não
 * pode apanhar `.anel-frase-texto` nem `.anel-frase:last-child`.
 */
function blocosDe(seletor: string): string[] {
  const blocos: string[] = [];
  const alvo = new RegExp(`(^|[},;/*\\s])${seletor.replace(".", "\\.")}\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = alvo.exec(CSS)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    const inicio = i;
    while (i < CSS.length && profundidade > 0) {
      if (CSS[i] === "{") profundidade++;
      else if (CSS[i] === "}") profundidade--;
      i++;
    }
    blocos.push(CSS.slice(inicio, i - 1));
  }
  return blocos;
}

function declaracoesDeCaixa(seletor: string): string[] {
  return blocosDe(seletor)
    .flatMap((b) => b.split("\n"))
    .filter((linha) => PROPRIEDADES_DE_CAIXA.test(linha));
}

describe("as peças da landing têm o mesmo feitio em todos os ecrãs", () => {
  it("encontra mesmo os blocos que diz estar a verificar", () => {
    // Sem isto, um seletor renomeado transformava este ficheiro num teste que
    // não testa nada e continuava verde.
    expect(blocosDe(".anel").length).toBeGreaterThanOrEqual(3);
    expect(blocosDe(".anel-frase").length).toBeGreaterThanOrEqual(2);
  });

  it("a caixa do baralho de frases não lê o tamanho da janela", () => {
    const culpadas = declaracoesDeCaixa(".anel").filter((l) => UNIDADES_DE_JANELA.test(l));
    expect(
      culpadas,
      `A caixa do baralho passou a depender da janela: ${culpadas.join(" | ")}. ` +
        `A altura tem de vir do cartão mais alto (as frases empilhadas na mesma célula ` +
        `da grelha), não de uma fração do ecrã.`,
    ).toEqual([]);
  });

  it("a caixa de cada frase não lê o tamanho da janela", () => {
    const culpadas = declaracoesDeCaixa(".anel-frase").filter((l) => UNIDADES_DE_JANELA.test(l));
    expect(
      culpadas,
      `A caixa de uma frase passou a depender da janela: ${culpadas.join(" | ")}.`,
    ).toEqual([]);
  });

  it("as frases empilham-se pela grelha, que é o que lhes dá a altura do conteúdo", () => {
    // `position: absolute; inset: 0` põe-nas no mesmo sítio mas obriga a caixa
    // a ter uma altura escrita à mão — e foi essa altura que veio da janela.
    for (const bloco of blocosDe(".anel-frase")) {
      expect(bloco).toMatch(/grid-area:\s*1\s*\/\s*1/);
      expect(bloco).not.toMatch(/position:\s*absolute/);
    }
  });

  it("o anel em 3D só corre onde há ponteiro fino, e o baralho apanha o resto", () => {
    // O anel vive de `preserve-3d` com `backface-visibility`, que alguns
    // browsers de Android achatam — as frases de trás apareciam ao contrário.
    // As duas condições têm de ser exclusivas uma da outra: se as duas
    // pegassem, ficavam dois efeitos por cima um do outro; se nenhuma pegasse,
    // ficava a lista simples num ecrã que merecia melhor.
    const anel3d = CSS.match(/@media[^{]*pointer:\s*fine[^{]*min-width:\s*1024px[^{]*\{/);
    expect(anel3d, "o anel deixou de exigir ponteiro fino").not.toBeNull();

    const baralho = CSS.match(/@media[^{]*max-width:\s*1023px\)?\s*or\s*\(pointer:\s*coarse[^{]*\{/);
    expect(baralho, "o baralho deixou de apanhar os ecrãs largos de toque").not.toBeNull();
  });
});
