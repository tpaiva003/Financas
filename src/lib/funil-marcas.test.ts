/**
 * O logo do funil descobre-se sozinho — o campo manual morreu.
 *
 * O funil pedia um «Domínio da marca» escrito à mão enquanto os investimentos
 * descobriam o deles sozinhos (tabela de gestoras → modelo → ícone
 * verificado), e o resultado era o esperado: os logos do funil funcionavam
 * pior, porque dependiam de alguém saber e escrever "abc.xyz". Estes testes
 * leem o código e falham contra essa versão: os formulários não podem voltar a
 * pedir o domínio, e os caminhos que criam entradas no funil têm de passar
 * pela descoberta automática.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const ACTIONS = readFileSync(join(RAIZ, "src", "app", "(app)", "actions.ts"), "utf8");

function corpoDe(nome: string): string {
  const inicio = ACTIONS.indexOf(`export async function ${nome}`);
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const resto = ACTIONS.slice(inicio + 1);
  const fim = resto.search(/export async function /);
  return resto.slice(0, fim === -1 ? undefined : fim);
}

describe("os formulários do funil já não pedem o domínio da marca", () => {
  it.each(["NovaAvaliacao.tsx", "FunilAvaliacoes.tsx", "GuardarAvaliacao.tsx"])(
    "%s não tem campo logoDomain",
    (ficheiro) => {
      const fonte = readFileSync(join(RAIZ, "src", "components", ficheiro), "utf8");
      expect(fonte).not.toMatch(/name="logoDomain"|nome="logoDomain"/);
    },
  );
});

describe("quem cria entradas no funil descobre a marca sozinho", () => {
  it("criarAvaliacaoAction descobre em vez de ler do formulário", () => {
    const corpo = corpoDe("criarAvaliacaoAction");
    expect(corpo).not.toContain('formData.get("logoDomain")');
    expect(corpo).toContain("marcaComPrazo");
  });

  it("guardarAvaliacaoAction descobre nos dois caminhos (funil e novo)", () => {
    const corpo = corpoDe("guardarAvaliacaoAction");
    expect(corpo).toContain("marcaComPrazo");
  });

  it("editarAvaliacaoAction deixou de aceitar logoDomain do formulário", () => {
    const corpo = corpoDe("editarAvaliacaoAction");
    expect(corpo).not.toContain("logoDomain");
  });

  it("o funil tem o mesmo «Pôr logos» dos investimentos", () => {
    expect(corpoDe("descobrirMarcasFunilAction")).toContain("descobrirMarcas(");
    const pagina = readFileSync(
      join(RAIZ, "src", "app", "(app)", "patrimonio", "avaliacoes", "page.tsx"),
      "utf8",
    );
    expect(pagina).toContain('DescobrirMarcas alvo="funil"');
  });
});
