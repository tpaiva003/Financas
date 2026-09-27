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
 *
 * **A segunda metade da cortina: as unidades.** Tapar os euros não chegava.
 * O preço de uma ação é público — quem vir "125 un." vai ao telemóvel,
 * multiplica pela cotação e sabe quanto lá está. Por isso as unidades saem no
 * modo privacidade (`so-aberto`, `bloco-aberto`) e, em troca, os preços por
 * unidade ficam à vista (`preco-un`): sozinhos não reconstroem posição
 * nenhuma. Há aqui um teste para cada metade.
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
        // O atributo pode abrir numa linha e o texto vir na seguinte, quando o
        // valor é escolhido por um ternário.
        const atributo = linhas.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (NAO_SE_DESENHA.some((r) => r.test(atributo))) return;

        // A classe pode estar na própria linha ou numa das duas anteriores
        // (JSX partido pelo formatador), ou o valor vai numa prop marcada
        // com `dinheiro` no componente que o desenha.
        //
        // `preco-un` é a excepção escrita: um preço POR UNIDADE fica à vista de
        // propósito, porque sem o número de unidades não diz quanto lá está.
        const janela = linhas.slice(Math.max(0, i - 6), i + 2).join("\n");
        if (janela.includes("dinheiro") || janela.includes("preco-un")) return;

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
  /**
   * Tira as chamadas a `formatCents`, com os parênteses todos.
   *
   * Sem isto, uma linha que multiplique unidades por um preço para desenhar um
   * total (`formatCents(quantity * preco)`) contava como se estivesse a
   * mostrar as unidades — e passava a esconder o problema em vez de o apanhar.
   */
  function semDinheiro(linha: string): string {
    let out = "";
    let i = 0;
    while (i < linha.length) {
      const j = linha.indexOf("formatCents(", i);
      if (j === -1) {
        out += linha.slice(i);
        break;
      }
      out += linha.slice(i, j);
      let k = j + "formatCents(".length;
      let nivel = 1;
      while (k < linha.length && nivel > 0) {
        if (linha[k] === "(") nivel++;
        else if (linha[k] === ")") nivel--;
        k++;
      }
      i = k;
    }
    return out;
  }

  it("as unidades desenhadas saem quando os valores estão tapados", () => {
    // Um número de unidades escrito no ecrã, e não uma propriedade de objeto
    // (`quantity: x`) nem o nome de uma coluna dentro de aspas.
    const QUANTIDADE = /(^|[^=])\{[^{}]*\b\w*(quantity|unidades|Quantity)\w*\b[^{}]*\}/;
    const escapadas: string[] = [];

    for (const f of ecras(RAIZ)) {
      const linhas = readFileSync(f, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return; // comentário
        const limpa = semDinheiro(linha).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
        if (/\b\w*[Qq]uantity\w*\s*:|\bunidades\w*\s*:/.test(limpa)) return; // propriedade
        if (!QUANTIDADE.test(limpa)) return;

        const janela = linhas.slice(Math.max(0, i - 4), i + 5).join("\n");
        if (/so-aberto|bloco-aberto/.test(janela)) return;

        escapadas.push(`${f.replace(RAIZ + "/", "")}:${i + 1}: ${linha.trim().slice(0, 90)}`);
      });
    }

    expect(
      escapadas,
      `unidades à vista com o modo privacidade ligado:\n${escapadas.join("\n")}`,
    ).toEqual([]);
  });

  it("a folha de estilo troca mesmo o que se mostra em cada modo", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    expect(css).toMatch(/html\[data-privado="1"\]\s*\.so-aberto/);
    expect(css).toMatch(/html\[data-privado="1"\]\s*\.so-privado/);
    expect(css).toMatch(/html\[data-privado="1"\]\s*\.bloco-aberto/);
    // Sem esta, o que é `so-privado` aparecia nos dois modos.
    expect(css).toMatch(/\.so-privado\s*\{\s*display:\s*none/);
  });
});
