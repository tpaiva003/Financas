import { describe, expect, it } from "vitest";
import {
  MODULOS_FUNDAMENTAIS,
  cagrPct,
  cenariosDoHistorico,
  moedasBatem,
  parseFundamentais,
  tendenciaDaSerie,
  urlDosFundamentais,
} from "./fundamentais";

const dia = (a: number, m: number, d: number) => ({ raw: Date.UTC(a, m - 1, d) / 1000 });

/**
 * Uma empresa inventada, com números redondos escolhidos para os rácios darem
 * valores que se conferem de cabeça. Não são dados de ninguém.
 */
const RESPOSTA = JSON.stringify({
  quoteSummary: {
    result: [
      {
        price: {
          longName: "Empresa de Ensaio",
          // Pence, não libras. A caixa da letra é a única diferença.
          currency: "GBp",
          financialCurrency: "GBP",
          regularMarketPrice: { raw: 1234.5 },
        },
        defaultKeyStatistics: { sharesOutstanding: { raw: 2_000_000_000 } },
        financialData: {
          freeCashflow: { raw: 28_000_000_000 },
          totalDebt: { raw: 25_000_000_000 },
          totalCash: { raw: 30_000_000_000 },
        },
        incomeStatementHistory: {
          incomeStatementHistory: [
            {
              endDate: dia(2024, 12, 31),
              totalRevenue: { raw: 100_000_000_000 },
              grossProfit: { raw: 58_000_000_000 },
              operatingIncome: { raw: 32_000_000_000 },
              netIncome: { raw: 26_000_000_000 },
            },
            {
              endDate: dia(2023, 12, 31),
              totalRevenue: { raw: 80_000_000_000 },
              grossProfit: { raw: 44_000_000_000 },
              operatingIncome: { raw: 24_000_000_000 },
              netIncome: { raw: 20_000_000_000 },
            },
          ],
        },
        balanceSheetHistory: {
          balanceSheetStatements: [
            {
              endDate: dia(2024, 12, 31),
              totalAssets: { raw: 200_000_000_000 },
              totalCurrentAssets: { raw: 80_000_000_000 },
              totalCurrentLiabilities: { raw: 40_000_000_000 },
              totalStockholderEquity: { raw: 130_000_000_000 },
              shortLongTermDebt: { raw: 5_000_000_000 },
              longTermDebt: { raw: 20_000_000_000 },
            },
            {
              endDate: dia(2023, 12, 31),
              totalAssets: { raw: 170_000_000_000 },
              totalCurrentAssets: { raw: 70_000_000_000 },
              totalCurrentLiabilities: { raw: 35_000_000_000 },
              totalStockholderEquity: { raw: 110_000_000_000 },
              shortLongTermDebt: { raw: 4_000_000_000 },
              longTermDebt: { raw: 18_000_000_000 },
            },
          ],
        },
        cashflowStatementHistory: {
          cashflowStatements: [
            {
              endDate: dia(2024, 12, 31),
              totalCashFromOperatingActivities: { raw: 40_000_000_000 },
              // Negativo, como o Yahoo o devolve.
              capitalExpenditures: { raw: -12_000_000_000 },
            },
            {
              endDate: dia(2023, 12, 31),
              totalCashFromOperatingActivities: { raw: 32_000_000_000 },
              capitalExpenditures: { raw: -10_000_000_000 },
            },
          ],
        },
        earningsTrend: {
          trend: [
            { period: "+1y", growth: { raw: 0.12 } },
            { period: "+5y", growth: { raw: 0.085 } },
          ],
        },
        calendarEvents: {
          earnings: { earningsDate: [dia(2026, 2, 3)] },
          dividendDate: dia(2026, 3, 10),
          exDividendDate: dia(2026, 2, 20),
        },
      },
    ],
  },
});

describe("parseFundamentais", () => {
  const f = parseFundamentais(RESPOSTA);

  it("lê a identificação e as duas moedas", () => {
    expect(f.nome).toBe("Empresa de Ensaio");
    expect(f.moedaCotacao).toBe("GBP");
    expect(f.moedaRelato).toBe("GBP");
  });

  /**
   * O cem-vezes que já custou caro nas cotações. `GBp` são pence: 1234,5 na
   * resposta são 12,345 libras. Sem esta divisão o DCF compararia um valor por
   * ação com um preço cem vezes maior e diria que está barata para sempre.
   */
  it("divide o preço quando a cotação vem em pence", () => {
    expect(f.precoUnidade).toBe(12.345);
  });

  it("traz os campos que o formulário precisa, em milhares de milhões", () => {
    expect(f.fcfBilioes).toBe(28);
    expect(f.acoesBilioes).toBe(2);
    expect(f.dividaBilioes).toBe(25);
    expect(f.caixaBilioes).toBe(30);
    expect(f.emFalta).toEqual([]);
  });

  it("ordena o historial do mais antigo para o mais recente", () => {
    expect(f.historico.map((h) => h.ano)).toEqual([2023, 2024]);
  });

  /**
   * O investimento em ativo fixo vem **negativo** na resposta. Quem o subtraia
   * em vez de o somar obtém 52 mM de fluxo livre onde há 28 — quase o dobro, e
   * o dobro do valor por ação no fim.
   */
  it("soma um capex que já vem negativo", () => {
    const [h2023, h2024] = f.historico;
    expect(h2023!.fcfBilioes).toBe(22);
    expect(h2024!.fcfBilioes).toBe(28);
  });

  it("calcula os rácios de cada ano", () => {
    const [, h] = f.historico;
    expect(h!.margemBrutaPct).toBe(58);
    expect(h!.margemOperacionalPct).toBe(32);
    expect(h!.margemLiquidaPct).toBe(26);
    // EBIT sobre capital empregue: 32 / (200 − 40).
    expect(h!.rocePct).toBe(20);
    expect(h!.roePct).toBe(20);
    expect(h!.dividaSobreCapitalPct).toBe(19.2);
    expect(h!.liquidezCorrente).toBe(2);
    expect(h!.margemFcfPct).toBe(28);
  });

  it("resume o historial em médias e num crescimento composto", () => {
    expect(f.medias.anos).toBe(2);
    expect(f.medias.rocePct).toBe(18.9);
    expect(f.medias.margemOperacionalPct).toBe(31);
    // 22 → 28 num ano.
    expect(f.medias.crescimentoFcfPct).toBe(27.3);
    expect(f.medias.crescimentoReceitaPct).toBe(25);
  });

  it("traz as estimativas dos analistas e as datas", () => {
    expect(f.estimativas.crescimento1aPct).toBe(12);
    expect(f.estimativas.crescimento5aPct).toBe(8.5);
    expect(f.datas.resultados).toBe("2026-02-03");
    expect(f.datas.dividendo).toBe("2026-03-10");
    expect(f.datas.exDividendo).toBe("2026-02-20");
  });
});

describe("parseFundamentais — o que se recusa a calcular", () => {
  /**
   * Com capital próprio negativo, `lucro / capital` sai positivo e enorme, e
   * lê-se exactamente ao contrário do que significa. Uma empresa endividada até
   * ao osso apareceria com o melhor ROE da carteira.
   */
  it("não inventa um ROE com capital próprio negativo", () => {
    const f = parseFundamentais(
      JSON.stringify({
        quoteSummary: {
          result: [
            {
              incomeStatementHistory: {
                incomeStatementHistory: [
                  { endDate: dia(2024, 12, 31), totalRevenue: { raw: 10 }, netIncome: { raw: 2 } },
                ],
              },
              balanceSheetHistory: {
                balanceSheetStatements: [
                  {
                    endDate: dia(2024, 12, 31),
                    totalStockholderEquity: { raw: -5_000_000_000 },
                    longTermDebt: { raw: 9_000_000_000 },
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(f.historico[0]!.roePct).toBeNull();
    expect(f.historico[0]!.dividaSobreCapitalPct).toBeNull();
  });

  it("diz o que faltou em vez de deixar campos vazios sem explicação", () => {
    const f = parseFundamentais(JSON.stringify({ quoteSummary: { result: [{ price: {} }] } }));
    expect(f.fcfBilioes).toBeNull();
    expect(f.emFalta).toContain("o fluxo de caixa livre");
    expect(f.emFalta).toContain("o historial de contas");
  });

  it("aguenta um JSON partido e uma resposta sem resultado", () => {
    expect(parseFundamentais("<html>bloqueado</html>").emFalta.length).toBeGreaterThan(0);
    expect(parseFundamentais(JSON.stringify({ quoteSummary: { result: [] } })).historico).toEqual([]);
  });

  it("não conta duas vezes um exercício reexpresso", () => {
    const f = parseFundamentais(
      JSON.stringify({
        quoteSummary: {
          result: [
            {
              incomeStatementHistory: {
                incomeStatementHistory: [
                  { endDate: dia(2024, 12, 31), totalRevenue: { raw: 100 }, netIncome: { raw: 10 } },
                  { endDate: dia(2024, 6, 30), totalRevenue: { raw: 50 }, netIncome: { raw: 5 } },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(f.historico).toHaveLength(1);
    expect(f.historico[0]!.margemLiquidaPct).toBe(10);
  });
});

/**
 * Os trimestres. Quatro pontos anuais escondem uma margem que virou há dois
 * trimestres, e é para isso que esta série existe.
 */
describe("parseFundamentais — a série trimestral", () => {
  const trimestres = (meses: number[]) =>
    meses.map((m, i) => ({
      endDate: dia(2025, m, 30),
      totalRevenue: { raw: (20 + i) * 1_000_000_000 },
      operatingIncome: { raw: (5 + i) * 1_000_000_000 },
      netIncome: { raw: (4 + i) * 1_000_000_000 },
    }));

  const RESP = JSON.stringify({
    quoteSummary: {
      result: [
        {
          price: { longName: "Empresa de Ensaio" },
          incomeStatementHistoryQuarterly: {
            incomeStatementHistory: trimestres([3, 6, 9, 12]),
          },
        },
      ],
    },
  });

  /**
   * O teste que falha contra o código antigo — e falharia contra a versão
   * ingénua desta mudança. Indexar os trimestres pelo ano, como o anual faz de
   * propósito, colapsava os quatro trimestres de 2025 num só: a série ficava
   * com um ponto onde devia ter quatro, e ninguém desconfiava, porque um
   * gráfico com um ponto lê-se como "esta empresa só reportou uma vez".
   */
  it("quatro trimestres do mesmo ano dão quatro pontos", () => {
    const f = parseFundamentais(RESP);
    expect(f.trimestral).toHaveLength(4);
    expect(f.trimestral.map((t) => t.rotulo)).toEqual([
      "mar/25",
      "jun/25",
      "set/25",
      "dez/25",
    ]);
  });

  it("vem do mais antigo para o mais recente, como o anual", () => {
    const f = parseFundamentais(RESP);
    const fins = f.trimestral.map((t) => t.fim);
    expect([...fins].sort()).toEqual(fins);
  });

  /**
   * A sazonalidade não é desempenho. Um trimestre de Natal a seguir a um de
   * janeiro dava um "crescimento" que é só o calendário — por isso nada do que
   * decide o DCF pode vir daqui.
   */
  it("os trimestres não entram nas médias nem nos cenários", () => {
    const f = parseFundamentais(RESP);
    expect(f.medias.anos).toBe(0);
    expect(f.medias.crescimentoReceitaPct).toBeNull();
    expect(cenariosDoHistorico(f.medias)).toBeNull();
  });

  it("sem módulos trimestrais a série fica vazia, e não rebenta", () => {
    expect(parseFundamentais(RESPOSTA).trimestral).toEqual([]);
  });

  /** O anual continua a dedupar por ano: um exercício reexpresso é o mesmo ano. */
  it("o anual junta dois fechos do mesmo ano num só", () => {
    const f = parseFundamentais(
      JSON.stringify({
        quoteSummary: {
          result: [
            {
              incomeStatementHistory: {
                incomeStatementHistory: [
                  { endDate: dia(2024, 12, 31), totalRevenue: { raw: 100_000_000_000 } },
                  { endDate: dia(2024, 9, 30), totalRevenue: { raw: 90_000_000_000 } },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(f.historico).toHaveLength(1);
    expect(f.historico[0]!.rotulo).toBe("2024");
  });
});

describe("MODULOS_FUNDAMENTAIS", () => {
  it("pede os trimestres no mesmo pedido", () => {
    expect(MODULOS_FUNDAMENTAIS).toContain("incomeStatementHistoryQuarterly");
    expect(MODULOS_FUNDAMENTAIS).toContain("balanceSheetHistoryQuarterly");
    expect(MODULOS_FUNDAMENTAIS).toContain("cashflowStatementHistoryQuarterly");
  });
});

describe("parseFundamentais — o perfil da empresa", () => {
  const comPerfil = (perfil: unknown) =>
    parseFundamentais(JSON.stringify({ quoteSummary: { result: [{ assetProfile: perfil }] } }));

  it("lê o setor e a indústria", () => {
    const f = comPerfil({ sector: "Technology", industry: "Software—Infrastructure" });
    expect(f.setor).toBe("Technology");
    expect(f.industria).toBe("Software—Infrastructure");
  });

  /**
   * Uma cadeia vazia guardada como está abria um grupo sem nome no gráfico da
   * carteira, indistinguível de um dado que nunca veio.
   */
  it("uma cadeia vazia não é um setor", () => {
    expect(comPerfil({ sector: "   ", industry: "" }).setor).toBeNull();
    expect(comPerfil({}).setor).toBeNull();
  });

  it("um ETF sem perfil nenhum não rebenta", () => {
    expect(parseFundamentais(RESPOSTA).setor).toBeNull();
  });

  it("pede o perfil no mesmo pedido", () => {
    expect(MODULOS_FUNDAMENTAIS).toContain("assetProfile");
  });
});

describe("tendenciaDaSerie", () => {
  it("compara a primeira leitura com a última", () => {
    const t = tendenciaDaSerie([10, 12, 15])!;
    expect(t.primeiro).toBe(10);
    expect(t.ultimo).toBe(15);
    expect(t.variacao).toBe(5);
    expect(t.variacaoPct).toBe(50);
    expect(t.buracos).toBe(0);
  });

  /**
   * Uma margem que vai de −5% para 3% melhorou oito pontos. A divisão dá −160%
   * — um número com o sinal ao contrário do que aconteceu, e que ninguém
   * confere porque uma percentagem não se confere contra nada.
   */
  it("não dá percentagem a partir de um ponto de partida negativo", () => {
    const t = tendenciaDaSerie([-5, 3])!;
    expect(t.variacao).toBe(8);
    expect(t.variacaoPct).toBeNull();
  });

  it("um buraco no meio não é interpolado, é contado", () => {
    const t = tendenciaDaSerie([10, null, 20])!;
    expect(t.pontos).toBe(2);
    expect(t.buracos).toBe(1);
    expect(t.ultimo).toBe(20);
  });

  it("uma leitura só não é tendência nenhuma", () => {
    expect(tendenciaDaSerie([10])).toBeNull();
    expect(tendenciaDaSerie([null, 10, null])).toBeNull();
    expect(tendenciaDaSerie([])).toBeNull();
  });
});

describe("moedasBatem", () => {
  it("denuncia relato e cotação em moedas diferentes", () => {
    const base = parseFundamentais(RESPOSTA);
    expect(moedasBatem(base)).toBe(true);
    expect(moedasBatem({ ...base, moedaRelato: "USD" })).toBe(false);
  });

  it("não acusa nada quando não sabe uma das moedas", () => {
    const base = parseFundamentais(RESPOSTA);
    expect(moedasBatem({ ...base, moedaRelato: null })).toBe(true);
  });
});

describe("cagrPct", () => {
  it("precisa de dois pontos e de ambos positivos", () => {
    expect(cagrPct([10])).toBeNull();
    expect(cagrPct([null, 10])).toBeNull();
    // Começar em prejuízo dá a raiz de um número negativo.
    expect(cagrPct([-3, 5])).toBeNull();
  });

  it("compõe ao longo dos anos, e não divide pelo primeiro", () => {
    // 100 → 200 em dois anos são 41,4% ao ano, não 50%.
    expect(cagrPct([100, 141.42, 200])).toBe(41.4);
  });
});

describe("cenariosDoHistorico", () => {
  it("trava o central nos 20% e faz a segunda fase mais lenta", () => {
    const c = cenariosDoHistorico(parseFundamentais(RESPOSTA).medias)!;
    expect(c.medio).toEqual([20, 14]);
    expect(c.baixo).toEqual([10, 6.7]);
    expect(c.alto).toEqual([25, 18]);
    for (const par of [c.baixo, c.medio, c.alto]) {
      expect(par[1]).toBeLessThan(par[0]);
    }
  });

  it("não sugere nada a partir de um historial a encolher", () => {
    expect(cenariosDoHistorico({ ...vaziasMedias, crescimentoFcfPct: -4 })).toBeNull();
    expect(cenariosDoHistorico(vaziasMedias)).toBeNull();
  });
});

const vaziasMedias = {
  rocePct: null,
  margemOperacionalPct: null,
  margemLiquidaPct: null,
  margemFcfPct: null,
  crescimentoFcfPct: null,
  crescimentoReceitaPct: null,
  anos: 0,
};

describe("urlDosFundamentais", () => {
  /**
   * O bug que isto fecha. `googl.us` é a convenção interna desta app e não é um
   * ticker que exista em lado nenhum: o Yahoo devolvia 404 a tudo, e um 404
   * lê-se como "esta empresa não existe" — quando o que não existia era o nome
   * que lhe estávamos a chamar.
   */
  it("traduz o símbolo interno para o que a fonte conhece", () => {
    expect(urlDosFundamentais("googl.us")).toContain("/quoteSummary/GOOGL?");
    expect(urlDosFundamentais("googl.us")).not.toContain("googl.us");
  });

  it("traduz as praças europeias, e não as passa a maiúsculas à sorte", () => {
    // Lisboa é `.LS` no Yahoo. `EDP.PT` não existe — foi a falha mais cara da
    // lista numa app portuguesa.
    expect(urlDosFundamentais("edp.pt")).toContain("/quoteSummary/EDP.LS?");
    expect(urlDosFundamentais("imae.nl")).toContain("/quoteSummary/IMAE.AS?");
    expect(urlDosFundamentais("vusa.uk")).toContain("/quoteSummary/VUSA.L?");
  });

  it("leva os módulos todos e o crumb quando o há", () => {
    const semCrumb = urlDosFundamentais("msft.us");
    expect(semCrumb).toContain("modules=");
    expect(semCrumb).not.toContain("crumb=");
    expect(urlDosFundamentais("msft.us", "aBc123")).toContain("crumb=aBc123");
  });

  it("cada módulo que a leitura precisa vai no pedido", () => {
    const url = urlDosFundamentais("msft.us");
    for (const m of MODULOS_FUNDAMENTAIS) {
      // Sem isto, tirar um módulo da lista deixava o campo a `null` para sempre
      // e o ecrã dizia só "faltou" — sem ninguém perceber que nunca foi pedido.
      expect(decodeURIComponent(url)).toContain(m);
    }
  });
});
