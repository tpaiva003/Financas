import { describe, expect, it } from "vitest";
import { todasAsLinhas } from "@/lib/data/supabase-repository";

/**
 * Uma tabela falsa que se comporta como a API do Supabase: devolve no máximo
 * mil linhas por pedido, e **não avisa** que há mais. É esse silêncio que torna
 * o problema perigoso, e é isso que estes testes reproduzem.
 */
function tabela(total: number) {
  const pedidos: Array<[number, number]> = [];
  const linhas = Array.from({ length: total }, (_, i) => ({ n: i }));
  const pagina = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    // O tecto da API: mesmo que se peça mais, nunca vêm mais de mil.
    const fim = Math.min(ate, de + 999);
    return { data: linhas.slice(de, fim + 1), error: null };
  };
  return { pagina, pedidos };
}

describe("todasAsLinhas", () => {
  it("traz tudo quando há mais do que mil linhas", async () => {
    // O caso que partiu em produção: 2513 cotações, das quais chegavam mil.
    const { pagina } = tabela(2513);
    const linhas = await todasAsLinhas<{ n: number }>(pagina);
    expect(linhas).toHaveLength(2513);
    // E na ordem certa: a última pedida é a última que existe.
    expect(linhas[0]!.n).toBe(0);
    expect(linhas[2512]!.n).toBe(2512);
  });

  it("um só pedido quando cabe tudo numa página", async () => {
    const { pagina, pedidos } = tabela(191);
    const linhas = await todasAsLinhas<{ n: number }>(pagina);
    expect(linhas).toHaveLength(191);
    expect(pedidos).toHaveLength(1);
  });

  it("exatamente mil linhas custa um pedido a mais, e não perde nenhuma", async () => {
    // O limite exato é onde isto costuma partir: mil linhas cheias são
    // indistinguíveis de "há mais", por isso pergunta-se outra vez.
    const { pagina, pedidos } = tabela(1000);
    const linhas = await todasAsLinhas<{ n: number }>(pagina);
    expect(linhas).toHaveLength(1000);
    expect(pedidos).toHaveLength(2);
  });

  it("uma tabela vazia não dá volta nenhuma a mais", async () => {
    const { pagina, pedidos } = tabela(0);
    expect(await todasAsLinhas(pagina)).toEqual([]);
    expect(pedidos).toHaveLength(1);
  });

  it("um erro numa página a meio não devolve dados meios", async () => {
    // Meia tabela é pior do que nenhuma: dava um saldo silenciosamente errado.
    let volta = 0;
    const pagina = async () => {
      volta++;
      if (volta === 2) return { data: null, error: { message: "ligação perdida" } };
      return { data: Array.from({ length: 1000 }, (_, i) => ({ n: i })), error: null };
    };
    await expect(todasAsLinhas(pagina)).rejects.toThrow("ligação perdida");
  });

  it("pede páginas de mil, sem sobreposição nem buracos", async () => {
    const { pagina, pedidos } = tabela(2500);
    await todasAsLinhas(pagina);
    expect(pedidos.slice(0, 3)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});
