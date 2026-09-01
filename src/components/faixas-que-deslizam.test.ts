/**
 * O que desliza na horizontal não pode cortar o que está lá dentro.
 *
 * **Porque é que isto é um teste que lê código-fonte.** `overflow-x: auto` tem
 * um efeito que ninguém escreve e quase ninguém espera: o `overflow-y` deixa
 * de ser `visible`. A partir daí o contentor corta nos dois eixos, e o que é
 * desenhado FORA da caixa de um filho — o anel de foco de um separador, o halo
 * de um campo — some-se sem deixar rasto.
 *
 * Isto apareceu como "num portátil o botão está cortado, no outro não". Não
 * era a máquina: era uma faixa com zero de folga em cima, e o anel de foco a
 * passar-lhe 2 px. Só se vê com o foco posto — e só nas máquinas onde a escala
 * do sistema desenha o anel mais gordo — por isso não há revisão de ecrã que o
 * apanhe.
 *
 * A regra: quem desliza usa a classe `.scroll-x`, que já traz a folga. Escrever
 * `overflow-x-auto` à mão é repor o problema.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "src");

function ecras(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      out.push(...ecras(caminho));
      continue;
    }
    if (nome.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

describe("faixas que deslizam na horizontal", () => {
  const ficheiros = ecras(RAIZ);

  it("usam a classe que traz a folga, e não o utilitário à mão", () => {
    const cruas: string[] = [];
    for (const f of ficheiros) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return; // comentário
          if (!/\boverflow-(x-)?auto\b/.test(linha)) return;
          cruas.push(`${f.replace(RAIZ + "/", "")}:${i + 1}: ${linha.trim().slice(0, 90)}`);
        });
    }
    expect(
      cruas,
      `faixas sem folga vertical (usa \`scroll-x\`):\n${cruas.join("\n")}`,
    ).toEqual([]);
  });

  it("encontra as faixas (senão isto não testa nada)", () => {
    const usos = ficheiros.filter((f) => /className="[^"]*\bscroll-x\b/.test(readFileSync(f, "utf8")));
    expect(usos.length).toBeGreaterThan(4);
  });

  it("a classe tem mesmo folga em cima e em baixo", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    const bloco = css.match(/\.scroll-x\s*\{[^}]*\}/)?.[0] ?? "";
    expect(bloco, "a classe .scroll-x não existe no globals.css").not.toEqual("");
    // `py-*` e não `pb-*`: o corte de cima foi exactamente o que aconteceu.
    expect(bloco).toMatch(/\bpy-[\d.]+/);
  });
});
