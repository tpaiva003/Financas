import { describe, expect, it } from "vitest";

import { buildSituacao, situacaoParaTexto, type SituacaoInput } from "./situacao";

function entrada(patch: Partial<SituacaoInput> = {}): SituacaoInput {
  return {
    assetsCents: 250_000_00,
    debtsCents: 180_000_00,
    byKind: [
      { label: "Imóveis", totalCents: 200_000_00 },
      { label: "Contas", totalCents: 50_000_00 },
    ],
    dividas: [
      {
        label: "Crédito à habitação",
        balanceCents: 180_000_00,
        monthlyPaymentCents: 780_00,
        annualRatePct: 3.3,
        nextChangeOn: "2028-01-15",
        nextPaymentCents: 820_00,
      },
    ],
    monthlyExpenseCents: 1_500_00,
    monthlyIncomeCents: 2_500_00,
    categorias: [{ label: "Supermercado", monthlyCents: 400_00 }],
    investmentCostCents: 0,
    investmentGainCents: null,
    historico: null,
    saldos: [
      { nome: "Tiago", netCents: 40_00 },
      { nome: "Rita", netCents: -40_00 },
    ],
    acertos: [{ de: "Rita", para: "Tiago", cents: 40_00 }],
    pagina: null,
    ...patch,
  };
}

describe("buildSituacao", () => {
  it("calcula o líquido e a taxa de poupança", () => {
    const s = buildSituacao(entrada());

    expect(s.netCents).toBe(70_000_00);
    expect(s.savingsRatePct).toBeCloseTo(40, 5);
  });

  /**
   * Sem rendimento registado, a divisão dá `Infinity` — e uma taxa de poupança
   * infinita a quem não registou o ordenado é o género de número em que ninguém
   * desconfia porque ninguém o lê como número.
   */
  it("não inventa taxa de poupança sem rendimento", () => {
    expect(buildSituacao(entrada({ monthlyIncomeCents: null })).savingsRatePct).toBeNull();
    expect(buildSituacao(entrada({ monthlyIncomeCents: 0 })).savingsRatePct).toBeNull();
  });

  it("diz quantos anos de despesa o património cobre", () => {
    const s = buildSituacao(entrada());

    // 70 000 de líquido, 18 000 de despesa por ano.
    expect(s.anosDeDespesa).toBeCloseTo(70_000 / 18_000, 5);
  });

  /**
   * Sem despesa registada a conta dá infinito, que se lê mesmo como boa
   * notícia. E com património negativo, "menos três anos" não quer dizer nada.
   */
  it("não diz anos nenhuns sem despesa ou com património negativo", () => {
    expect(buildSituacao(entrada({ monthlyExpenseCents: null })).anosDeDespesa).toBeNull();
    expect(buildSituacao(entrada({ monthlyExpenseCents: 0 })).anosDeDespesa).toBeNull();
    expect(buildSituacao(entrada({ assetsCents: 10_000_00 })).anosDeDespesa).toBeNull();
  });

  it("não come o ponto final quando os anos dão um número redondo", () => {
    // 60 000 de líquido e 15 000 de despesa por ano dão 4 anos certos.
    const s = buildSituacao(
      entrada({ assetsCents: 240_000_00, monthlyExpenseCents: 1_250_00 }),
    );
    const t = situacaoParaTexto(s);

    expect(t).toContain("dá para 4 anos da despesa atual.");
  });

  it("soma os juros de dívida por ano", () => {
    const s = buildSituacao(entrada());

    expect(s.annualDebtInterestCents).toBe(Math.round((180_000_00 * 3.3) / 100));
  });

  it("ignora as dívidas sem taxa em vez de lhes assumir uma", () => {
    const s = buildSituacao(
      entrada({
        dividas: [
          {
            label: "Empréstimo do carro",
            balanceCents: 10_000_00,
            monthlyPaymentCents: null,
            annualRatePct: null,
            nextChangeOn: null,
            nextPaymentCents: null,
          },
        ],
      }),
    );

    expect(s.annualDebtInterestCents).toBe(0);
  });
});

describe("situacaoParaTexto", () => {
  /**
   * Nunca cêntimos crus. Um modelo a ler "18000000" tanto pode dizer dezoito
   * milhões como cento e oitenta mil, e a frase sai com o mesmo ar de certeza
   * nos dois casos.
   */
  it("escreve os valores em euros e não em cêntimos", () => {
    const t = situacaoParaTexto(buildSituacao(entrada()));

    // Euros com vírgula decimal e símbolo, nunca o inteiro em cêntimos.
    expect(t).toMatch(/\d,\d{2}\s?€/);
    expect(t).not.toContain("7000000");
    expect(t).not.toContain("18000000");
  });

  it("diz por extenso quando não há taxa de poupança", () => {
    const t = situacaoParaTexto(buildSituacao(entrada({ monthlyIncomeCents: null })));

    expect(t).toContain("não há rendimento registado");
  });

  it("avisa quando ainda não há histórico, em vez de o omitir", () => {
    const t = situacaoParaTexto(buildSituacao(entrada()));

    expect(t).toContain("Ainda não há histórico");
  });

  it("escreve o degrau da prestação quando o crédito muda de taxa", () => {
    const t = situacaoParaTexto(buildSituacao(entrada()));

    expect(t).toContain("2028-01-15");
    expect(t).toContain("a prestação passa a");
  });

  /**
   * O resumo vai para fora. As notas dos bens são texto livre — cabe lá tudo o
   * que alguém escreveu sem pensar que seria enviado — e por isso não há sequer
   * campo para elas na entrada. Este teste existe para que acrescentar um seja
   * uma decisão e não um descuido.
   */
  it("não tem por onde levar as notas dos bens", () => {
    const chaves = Object.keys(entrada());

    expect(chaves).not.toContain("notes");
    expect(chaves).not.toContain("notas");
  });

  /**
   * Os nomes dos membros VÃO, e isso é deliberado: metade desta app é despesa
   * partilhada, e "quem me deve o quê?" não tem resposta possível sem eles.
   */
  it("diz quem tem a receber e quem tem a pagar, pelo nome", () => {
    const t = situacaoParaTexto(buildSituacao(entrada()));

    expect(t).toContain("Tiago tem a receber");
    expect(t).toContain("Rita tem a pagar");
    expect(t).toContain("Rita paga");
  });

  it("não fala de saldos quando o ambiente está sozinho", () => {
    const t = situacaoParaTexto(buildSituacao(entrada({ saldos: [], acertos: [] })));

    expect(t).not.toContain("Saldo entre as pessoas");
    expect(t).not.toContain("Pagamentos que zerariam");
  });

  it("diz em que página a pessoa está, quando se sabe", () => {
    const t = situacaoParaTexto(buildSituacao(entrada({ pagina: "/patrimonio" })));

    expect(t).toContain("/patrimonio");
  });
});

/**
 * A app é multi-ambiente e o chat só via o que estava aberto. Perguntar
 * "tenho dívidas?" com o crédito da casa noutro separador dava "não" — uma
 * frase falsa dita com toda a confiança.
 */
describe("outros ambientes no resumo", () => {
  it("aparecem, com o nome e o que se sabe deles", () => {
    const texto = situacaoParaTexto(
      buildSituacao(
        entrada({
          ambiente: "Casa",
          outrosAmbientes: [
            { nome: "Viagem ao Japão", netCents: 120_000, debtsCents: 0, meuSaldoCents: -35_000 },
          ],
        }),
      ),
    );
    expect(texto).toContain("Viagem ao Japão");
    expect(texto).toContain("tem a pagar");
  });

  it("diz de que ambiente são os números de cima", () => {
    const texto = situacaoParaTexto(
      buildSituacao(
        entrada({
          ambiente: "Casa",
          outrosAmbientes: [
            { nome: "Empresa", netCents: 1_000, debtsCents: 0, meuSaldoCents: null },
          ],
        }),
      ),
    );
    // Sem esta frase, os totais de cima leem-se como sendo de tudo.
    expect(texto).toContain('"Casa"');
  });

  it("sem outros ambientes não se fala deles", () => {
    const texto = situacaoParaTexto(buildSituacao(entrada()));
    expect(texto).not.toContain("mais estes ambientes");
  });
});
