/**
 * Quem esconde o formulário atrás de um botão tem de o fechar ao gravar.
 *
 * **O modo de falha.** Um formulário que só aparece depois de se carregar em
 * "Apontar uma empresa" tem dois estados, e a confirmação vive quase sempre no
 * estado FECHADO — ao lado do botão que o abre. Se ao gravar o formulário
 * continuar aberto, essa confirmação nunca chega a ser desenhada: o ecrã fica
 * exactamente como estava, com o que se escreveu ainda lá dentro. O que se
 * gravou nasce por baixo do formulário, que num portátil já é fora do que cabe
 * no ecrã.
 *
 * Lê-se como "carreguei e não aconteceu nada" — e o gesto seguinte é carregar
 * outra vez, e ficar com a mesma coisa gravada duas vezes. Aconteceu no funil.
 *
 * **Porque é que isto lê código-fonte.** É uma regra sobre o desenho do
 * componente, não sobre uma conta: os testes desta app correm em Node, sem
 * ecrã. O que se pode verificar sem browser é a regra — quem tem interruptor
 * desliga-o quando a ação corre bem — e é o que se verifica aqui.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENTES = join(process.cwd(), "src", "components");

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      out.push(...tsx(caminho));
      continue;
    }
    if (nome.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

/** O texto entre o `(` que se segue a `abre` e o parêntesis que o fecha. */
function corposDe(fonte: string, abre: string): string[] {
  const out: string[] = [];
  let i = fonte.indexOf(abre);
  while (i !== -1) {
    let nivel = 0;
    let j = i + abre.length - 1; // no `(` de `useEffect(`
    for (; j < fonte.length; j++) {
      if (fonte[j] === "(") nivel++;
      else if (fonte[j] === ")") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    out.push(fonte.slice(i, j + 1));
    i = fonte.indexOf(abre, j + 1);
  }
  return out;
}

/** O bloco `{ … }` que começa no índice dado, com as chavetas emparelhadas. */
function bloco(fonte: string, inicio: number): string {
  let nivel = 0;
  for (let j = inicio; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") {
      nivel--;
      if (nivel === 0) return fonte.slice(inicio, j + 1);
    }
  }
  return fonte.slice(inicio);
}

/**
 * Os interruptores que escondem a confirmação.
 *
 * É preciso o par todo: um `useState(false)`, um `if (!bandeira) { … }` que
 * devolve o estado fechado, e o `state.ok` a ser desenhado LÁ DENTRO. É essa
 * terceira parte que faz disto um problema — a confirmação existe só no lado
 * que não está no ecrã quando se grava. Um painel que abre e fecha sem lá ter a
 * confirmação (a caixa do chat, por exemplo) não tem nada a ver com isto: se
 * fechasse ao gravar, fechava em cima de quem estava a usá-lo.
 */
function interruptores(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/const \[(\w+), (set\w+)\] = useState\(false\)/g)) {
    const bandeira = m[1];
    const setter = m[2];
    if (!bandeira || !setter) continue;
    const fechado = new RegExp(`if \\(!${bandeira}\\) \\{`).exec(fonte);
    if (!fechado) continue;
    // O `- 1` põe o cursor na chaveta que abre o bloco, não a seguir a ela.
    if (bloco(fonte, fechado.index + fechado[0].length - 1).includes("state.ok")) {
      nomes.push(setter);
    }
  }
  return nomes;
}

describe("formulários que se abrem e fecham", () => {
  const ficheiros = tsx(COMPONENTES).filter((f) => {
    const fonte = readFileSync(f, "utf8");
    return (
      fonte.includes("useFormState") &&
      fonte.includes("state.ok") &&
      interruptores(fonte).length > 0
    );
  });

  it("há mesmo formulários destes (senão isto não testa nada)", () => {
    expect(ficheiros.length).toBeGreaterThan(0);
  });

  it("fecham-se quando a ação corre bem", () => {
    const abertos: string[] = [];
    for (const f of ficheiros) {
      const fonte = readFileSync(f, "utf8");
      const efeitos = corposDe(fonte, "useEffect(");
      const fecha = interruptores(fonte).some((setter) =>
        efeitos.some((e) => e.includes("state.ok") && e.includes(`${setter}(false)`)),
      );
      if (!fecha) abertos.push(f.replace(COMPONENTES + "/", ""));
    }
    expect(
      abertos,
      "gravam e ficam abertos, sem confirmação nenhuma à vista:\n" + abertos.join("\n"),
    ).toEqual([]);
  });
});
