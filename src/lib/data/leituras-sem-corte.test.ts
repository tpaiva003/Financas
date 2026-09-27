import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Uma leitura cortada mente em silêncio.
 *
 * O Supabase devolve no máximo mil linhas e não avisa que há mais. O projeto
 * já pagou este erro (as cotações do MSFT, o saldo que deixaria de ser
 * explicável) e escreveu o `todasAsLinhas` — mas o helper só protege as
 * consultas que se lembram de o usar. Na revisão de 2026-08-17 havia dezassete
 * `list*` esquecidos, entre eles o `listSettlements`, que entra no saldo: ao
 * milésimo primeiro acerto, o saldo passava a ignorar os mais antigos.
 *
 * Este teste lê o código-fonte, como o da guarda de congelamento: todo o
 * método `list*` do repositório Supabase tem de passar por `todasAsLinhas`
 * ou ter um `.limit(` deliberado. Sem lista de exceções de propósito — uma
 * leitura que quer mesmo ser cortada que o diga com um `.limit()` explícito.
 */

const FICHEIRO = join(__dirname, "supabase-repository.ts");

function metodosList(fonte: string): Array<{ nome: string; corpo: string }> {
  // Os métodos da classe estão indentados com dois espaços; o corpo de um vai
  // até ao `async` seguinte (ou ao fim do ficheiro).
  const pedacos = fonte.split(/\n  async /).slice(1);
  return pedacos
    .map((p) => {
      const nome = p.match(/^(\w+)\(/)?.[1] ?? "";
      return { nome, corpo: p };
    })
    .filter((m) => m.nome.startsWith("list"));
}

describe("leituras sem corte no repositório Supabase", () => {
  const fonte = readFileSync(FICHEIRO, "utf8");
  const metodos = metodosList(fonte);

  it("encontra os métodos (o parser não pode falhar em silêncio)", () => {
    expect(metodos.length).toBeGreaterThan(20);
    const nomes = metodos.map((m) => m.nome);
    expect(nomes).toContain("listExpenses");
    expect(nomes).toContain("listSettlements");
  });

  it("todo o list* pagina com todasAsLinhas ou corta de propósito com .limit", () => {
    const esquecidos = metodos
      .filter(
        (m) => !m.corpo.includes("todasAsLinhas") && !m.corpo.includes(".limit("),
      )
      .map((m) => m.nome);
    expect(
      esquecidos,
      `list* sem todasAsLinhas nem .limit(): ${esquecidos.join(", ")}`,
    ).toEqual([]);
  });
});
