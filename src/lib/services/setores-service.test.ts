/**
 * Um lote não pode abrir uma sessão nova por cada investimento.
 *
 * **O que isto protege, e já aconteceu a sério.** A primeira versão do
 * `atualizarSetores` chamava `buscarFundamentais` como o botão de uma empresa o
 * chama: sessão anónima nova a cada símbolo — dois pedidos extra — todas as
 * formas do ticker, e doze segundos de tolerância em cada pedido. Numa carteira
 * com quarenta investimentos sem setor, isso são mais de cem chamadas ao Yahoo e
 * minutos de espera dentro de uma função que vive segundos.
 *
 * O resultado não foi "gravou metade". Foi **zero**: a função morria antes da
 * primeira escrita, e do lado de fora via-se um botão que não fazia nada.
 *
 * Este teste conta as idas à rede por tipo, que é a única forma de o apanhar sem
 * esperar dez segundos por ele.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

const pedidos: string[] = [];

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

/**
 * O Yahoo, contado. A sessão dá-se por boa e as contas vêm sempre com setor,
 * para o que sobra a medir ser o número de idas à rede.
 */
global.fetch = vi.fn(async (url: unknown) => {
  const u = String(url);
  pedidos.push(u);

  if (u.includes("fc.yahoo.com")) {
    return new Response("", { status: 404, headers: { "set-cookie": "A=1; Path=/" } });
  }
  if (u.includes("getcrumb")) {
    return new Response("abc123", { status: 200 });
  }
  /**
   * **Sem `crumb`, 401 — como o Yahoo a sério responde.**
   *
   * É esta linha que faz o teste valer alguma coisa. Com o mock a devolver 200
   * à primeira, o caminho que pede a sessão nunca era percorrido e o teste
   * passava contra a versão avariada: nada acontecia porque nada era preciso.
   * É o mesmo engano de escrever um teste que passa dos dois lados.
   */
  if (!u.includes("crumb=")) {
    return new Response("{}", { status: 401 });
  }
  return new Response(
    JSON.stringify({
      quoteSummary: {
        result: [
          {
            price: { longName: "Empresa de Ensaio", regularMarketPrice: { raw: 10 } },
            assetProfile: { sector: "Technology", industry: "Software" },
          },
        ],
      },
    }),
    { status: 200 },
  );
}) as unknown as typeof fetch;

/** O armazém do mock persiste entre testes; cada um leva o seu ambiente. */
let n = 0;

async function carteiraCom(quantos: number) {
  const ESPACO = `casa-setores-${(n += 1)}`;
  const { getRepository } = await import("@/lib/data");
  const repo = getRepository() as unknown as MockRepository;
  for (let i = 0; i < quantos; i++) {
    await repo.createAsset({
      spaceId: ESPACO,
      name: `Empresa ${i}`,
      kind: "investimento",
      symbol: `aaa${i}.us`,
      quantity: 1,
    });
  }
  return ESPACO;
}

describe("atualizarSetores", () => {
  beforeEach(() => {
    pedidos.length = 0;
  });

  /**
   * O teste que falha contra a versão que foi para produção: lá, cada símbolo
   * abria a sua sessão, e doze investimentos davam doze cookies e doze crumbs.
   */
  it("abre uma sessão só para o lote todo", async () => {
    const espaco = await carteiraCom(8);
    const { atualizarSetores } = await import("./setores-service");

    await atualizarSetores(espaco);

    const cookies = pedidos.filter((u) => u.includes("fc.yahoo.com")).length;
    const crumbs = pedidos.filter((u) => u.includes("getcrumb")).length;
    expect(cookies).toBe(1);
    expect(crumbs).toBe(1);
  });

  it("grava o setor e carimba quando a consulta corre", async () => {
    const espaco = await carteiraCom(3);
    const { getRepository } = await import("@/lib/data");
    const { atualizarSetores } = await import("./setores-service");

    const r = await atualizarSetores(espaco);

    expect(r.gravados).toBe(3);
    expect(r.falhados).toBe(0);
    const bens = await getRepository().listAssets(espaco);
    expect(bens.every((b) => b.sector === "Technology")).toBe(true);
    expect(bens.every((b) => Boolean(b.profileAt))).toBe(true);
  });

  /**
   * Um lote que trata oito de quarenta e não o diz lê-se como "está tratado" —
   * e quem lê fica a olhar para uma tabela meia por classificar sem perceber
   * que só tem de carregar outra vez.
   */
  it("diz quantos ficaram por fazer", async () => {
    // Acima do tecto de propósito, seja ele qual for: o que se mede é a
    // contabilidade, e não o número escolhido para o tecto — esse muda quando o
    // tempo disponível muda, e um teste preso a ele quebra a cada afinação sem
    // nada estar errado.
    const QUANTOS = 40;
    const espaco = await carteiraCom(QUANTOS);
    const { atualizarSetores } = await import("./setores-service");

    const r = await atualizarSetores(espaco);

    expect(r.consultados).toBeLessThan(QUANTOS);
    expect(r.porFazer).toBe(QUANTOS - r.consultados);
    expect(r.porFazer).toBeGreaterThan(0);
    // E o que foi consultado bate certo com o que aconteceu a cada um.
    expect(r.gravados + r.semSetorNaFonte + r.falhados).toBe(r.consultados);
  });

  /** Quem já tem setor não se pergunta outra vez: é o invariante do manual. */
  it("não volta a perguntar por quem já tem setor", async () => {
    const espaco = await carteiraCom(2);
    const { getRepository } = await import("@/lib/data");
    const { atualizarSetores } = await import("./setores-service");

    await atualizarSetores(espaco);
    pedidos.length = 0;
    const segunda = await atualizarSetores(espaco);

    expect(segunda.consultados).toBe(0);
    expect(pedidos).toHaveLength(0);
  });
});
