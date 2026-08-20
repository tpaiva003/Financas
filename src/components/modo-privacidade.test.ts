/**
 * Todo o dinheiro que se desenha tem de poder ser tapado.
 *
 * **Porque é que isto é um teste que lê código-fonte.** O modo privacidade
 * existe para se poder mostrar a app a alguém sem mostrar os valores. Basta
 * UM montante sem a classe `dinheiro` para a cortina ter um buraco — e um
 * buraco destes não se vê a testar a app com o modo desligado, que é como se
 * usa noventa e nove por cento do tempo. Descobre-se no pior sítio possível:
 * a projetar o ecrã à frente de alguém.
 *
 * A regra: em ficheiros de ecrã (`.tsx`), toda a chamada a `formatCents` que
 * desenhe algo tem de ter a classe por perto. As exceções estão listadas com
 * o motivo, e são todas coisas que não aparecem no ecrã: atributos `title`,
 * `aria-label` e afins.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "src");

/** Não se desenham: são texto para o browser ou para leitores de ecrã. */
const NAO_SE_DESENHA = [
  /title=\{/,
  /aria-label=\{/,
  /<title>/,
  /confirm=\{/,
];

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

describe("modo privacidade", () => {
  const ficheiros = ecras(RAIZ).filter((f) => readFileSync(f, "utf8").includes("formatCents("));

  it("encontra os ecrãs com dinheiro (senão isto não testa nada)", () => {
    expect(ficheiros.length).toBeGreaterThan(15);
  });

  it("todo o montante desenhado tem a classe que o modo privacidade tapa", () => {
    const escapados: string[] = [];

    for (const f of ficheiros) {
      const linhas = readFileSync(f, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!linha.includes("formatCents(")) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return; // comentário
        if (/^\s*import\b/.test(linha)) return;
        if (NAO_SE_DESENHA.some((r) => r.test(linha))) return;

        // A classe pode estar na própria linha ou numa das duas anteriores
        // (JSX partido pelo formatador), ou o valor vai numa prop marcada
        // com `dinheiro` no componente que o desenha.
        const janela = linhas.slice(Math.max(0, i - 6), i + 2).join("\n");
        if (janela.includes("dinheiro")) return;

        escapados.push(`${f.replace(RAIZ + "/", "")}:${i + 1}: ${linha.trim().slice(0, 90)}`);
      });
    }

    expect(escapados, `montantes sem a classe "dinheiro":\n${escapados.join("\n")}`).toEqual([]);
  });

  it("a folha de estilo tapa mesmo a classe", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    expect(css).toMatch(/html\[data-privado="1"\]\s*\.dinheiro/);
    // Tapar com pontos e não com desfoque: um valor desfocado ainda deixa
    // ler a ordem de grandeza.
    expect(css).toContain('content: "•••"');
  });
});
