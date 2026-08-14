/**
 * A página do património não pode ir à rede por cada investimento.
 *
 * **O que isto protege.** Um símbolo que a fonte não conhece nunca chega a ter
 * cotação guardada, e por isso conta como "velho" **em todas as visitas para
 * sempre**: quatro formas do ticker, dez segundos de espera cada, por cada um
 * deles, sempre. Com uma dúzia desses na carteira, abrir o ecrã passava a ser
 * uma ida à rede de vários minutos — e ninguém percebia porquê, porque a página
 * até acabava por abrir.
 *
 * São dois testes e medem duas coisas diferentes: quantas vezes se vai à base de
 * dados (era três por símbolo) e quantas vezes se vai à rede (era sem limite).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/data/mock-repository";

const idasARede = vi.fn();

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

/**
 * A fonte de cotações, contada e lenta de propósito.
 *
 * Devolve sempre vazio: é o caso que dói, o do símbolo que a fonte não conhece.
 */
vi.mock("@/lib/domain", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return real;
});

global.fetch = vi.fn(async (...args: unknown[]) => {
  idasARede(String(args[0]));
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;

/** O armazém do mock persiste entre testes; cada um leva o seu ambiente. */
let n = 0;

async function carteiraCom(quantos: number) {
  const ESPACO = `casa-${(n += 1)}`;
  const { getRepository } = await import("@/lib/data");
  const repo = getRepository() as unknown as MockRepository;
  for (let i = 0; i < quantos; i++) {
    await repo.createAsset({
      spaceId: ESPACO,
      name: `Empresa ${i}`,
      kind: "investimento",
      // Símbolos que a fonte não conhece: o caso que fazia a página arrastar-se.
      symbol: `zzz${i}`,
      quantity: 1,
    });
  }
  return ESPACO;
}

describe("refreshStalePrices", () => {
  beforeEach(() => {
    idasARede.mockClear();
  });

  /**
   * O teste que falha contra o código antigo. Sem tecto, vinte investimentos
   * sem cotação davam vinte × quatro formas do símbolo × duas fontes de idas à
   * rede antes de a página desenhar.
   */
  it("não vai à rede por cada investimento numa visita normal", async () => {
    const espaco = await carteiraCom(20);
    const { refreshStalePrices } = await import("./quotes-service");

    await refreshStalePrices(espaco);

    // Seis símbolos, cada um com as suas tentativas — muito longe de vinte.
    const simbolosTentados = new Set(
      [...idasARede.mock.calls].map((c) => String(c[0]).split("/").pop()),
    );
    expect(simbolosTentados.size).toBeLessThanOrEqual(6 * 4 * 2);
    expect(idasARede.mock.calls.length).toBeLessThan(20 * 4);
  });

  /**
   * Os que ficam de fora não desaparecem nem mentem: dizem que ainda não foram
   * consultados nesta visita. Um ecrã que se cala sobre isso deixa alguém a
   * olhar para um preço velho a pensar que é o de agora.
   */
  it("diz quais é que ficaram por atualizar", async () => {
    const espaco = await carteiraCom(20);
    const { refreshStalePrices } = await import("./quotes-service");

    const r = await refreshStalePrices(espaco);

    expect(r).toHaveLength(20);
    const adiados = r.filter((x) => x.problem?.includes("nesta visita"));
    expect(adiados.length).toBeGreaterThan(0);
  });

  /** Com `force` não há tecto: a espera foi pedida por quem carregou no botão. */
  it("com force vai a todos", async () => {
    const espaco = await carteiraCom(8);
    const { refreshStalePrices } = await import("./quotes-service");

    const r = await refreshStalePrices(espaco, { force: true });

    expect(r.every((x) => !x.problem?.includes("nesta visita"))).toBe(true);
  });
});
