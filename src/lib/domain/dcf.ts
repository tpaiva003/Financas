/**
 * Avaliação por fluxos de caixa descontados (DCF).
 *
 * **Este é o número mais perigoso desta app inteira, e vale a pena dizer
 * porquê.** Um DCF sai com quatro casas decimais e ar de facto, e é quase todo
 * feito de suposições: o crescimento dos próximos cinco anos, o crescimento
 * para sempre, e a taxa a que se desconta. Mudar a taxa de desconto em um ponto
 * percentual muda o valor por ação em dezenas de por cento. Quem olha para "vale
 * 182,40 €" não vê nada disso.
 *
 * Por isso este módulo faz três coisas que um DCF normal não faz:
 *
 * 1. **Devolve sempre um intervalo, não um número.** A sensibilidade à taxa de
 *    desconto e ao crescimento perpétuo vem calculada ao lado, e o ecrã mostra
 *    as três. Um DCF apresentado como um valor único é uma mentira de
 *    apresentação, mesmo com a aritmética certa.
 * 2. **Recusa-se quando os pressupostos não fazem sentido**, em vez de devolver
 *    um número. Com crescimento perpétuo maior ou igual à taxa de desconto, a
 *    fórmula do valor terminal divide por zero ou por um número negativo — e
 *    cospe um valor enorme ou negativo que parece uma resposta.
 * 3. **Guarda os pressupostos com o resultado.** Um valor sem eles não se
 *    consegue rever daqui a seis meses, e é o que faz um DCF antigo continuar a
 *    ser citado muito depois de as premissas terem deixado de valer.
 *
 * A margem de segurança existe pela mesma razão: o valor não é para se comparar
 * ao cêntimo com o preço, é para se ver se há folga.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface DcfInput {
  /** Fluxo de caixa livre do último ano, em cêntimos. */
  fcfCents: number;
  /** Crescimento anual do FCF na primeira fase, em percentagem. */
  crescimentoPct: number;
  /**
   * Crescimento anual da segunda fase, quando existe.
   *
   * **Duas fases e não uma, porque uma só é irrealista de uma forma que
   * favorece sempre o mesmo lado.** Uma empresa que cresce 15% ao ano não
   * cresce 15% durante dez anos: a concorrência chega, a base fica grande, o
   * mercado satura. Projetar a taxa dos primeiros anos até ao fim inflaciona o
   * valor terminal — que já é a maior parte do resultado — e o exagero entra
   * onde menos se vê.
   *
   * Omitido, a segunda fase não existe e vale a taxa da primeira em todos os
   * anos. É o comportamento que esta função tinha antes de haver fases.
   */
  crescimentoTardioPct?: number | null;
  /**
   * Quantos anos dura a primeira fase. Omitido = metade da projeção.
   */
  anosPrimeiraFase?: number | null;
  /** Crescimento a partir daí, para sempre, em percentagem. */
  crescimentoPerpetuoPct: number;
  /** Taxa de desconto anual (custo do capital), em percentagem. */
  descontoPct: number;
  /** Quantos anos de projeção explícita. */
  anos: number;
  /** Dívida menos caixa, em cêntimos. Negativo quando há mais caixa. */
  dividaLiquidaCents: number;
  /** Ações em circulação. */
  acoes: number;
  /** Preço atual por ação, em cêntimos. Só para a margem de segurança. */
  precoAtualCents?: number | null;
}

export interface DcfAno {
  ano: number;
  fcfCents: number;
  /** O mesmo fluxo trazido a valor de hoje. */
  presenteCents: number;
  /** A que taxa este ano cresceu. Muda entre as duas fases. */
  crescimentoPct: number;
}

export interface DcfResultado {
  anos: DcfAno[];
  /** Valor presente dos fluxos do período explícito. */
  explicitoCents: number;
  /** Valor presente do que vem depois, para sempre. */
  terminalCents: number;
  /** Os dois juntos: o valor da empresa. */
  empresaCents: number;
  /** Menos a dívida líquida: o que sobra para os acionistas. */
  capitalProprioCents: number;
  valorPorAcaoCents: number;
  /**
   * Que fatia do valor vem do valor terminal.
   *
   * Acima de uns 75% o DCF está a dizer sobretudo o que se assumiu sobre o
   * infinito, e quase nada sobre os anos que se projetaram. Não é um erro — é
   * a natureza da fórmula — mas quem lê tem de saber.
   */
  pesoDoTerminalPct: number;
  /** Quanto o preço está abaixo do valor, em percentagem. `null` sem preço. */
  margemDeSegurancaPct: number | null;
  /** O mesmo cálculo com a taxa de desconto e o crescimento mexidos. */
  sensibilidade: {
    label: string;
    valorPorAcaoCents: number;
  }[];
}

export type DcfSaida = { ok: DcfResultado } | { erro: string };

/** Projeções para lá disto não são análise, são ficção científica. */
const MAX_ANOS = 20;

/**
 * Faz a conta, ou explica porque não a faz.
 *
 * Nunca devolve um número quando os pressupostos não o suportam. Ver o
 * cabeçalho: um DCF impossível não dá erro sozinho — dá um número enorme.
 */
export function calcularDcf(input: DcfInput): DcfSaida {
  const r = nucleo(input);
  if ("erro" in r) return r;
  return { ok: { ...r.ok, sensibilidade: sensibilidade(input) } };
}

/**
 * A conta, sem a sensibilidade.
 *
 * Existe separada porque a sensibilidade **é** esta conta, repetida com os
 * pressupostos mexidos. Na primeira versão o `calcularDcf` chamava a
 * sensibilidade e a sensibilidade chamava o `calcularDcf`: recursão infinita,
 * e um comentário meu ao lado a garantir que não havia. Os testes apanharam-na
 * à primeira execução.
 */
function nucleo(input: DcfInput): { ok: Omit<DcfResultado, "sensibilidade"> } | { erro: string } {
  const { fcfCents, acoes } = input;
  const anos = Math.round(input.anos);
  const g = input.crescimentoPct / 100;
  const gT = input.crescimentoPerpetuoPct / 100;
  const r = input.descontoPct / 100;

  if (!Number.isFinite(fcfCents) || fcfCents <= 0) {
    return {
      erro:
        "O fluxo de caixa livre tem de ser positivo. Uma empresa que queima dinheiro não se avalia assim — o modelo assume que os fluxos crescem para sempre, e a partir de um número negativo isso dá um valor negativo cada vez maior.",
    };
  }
  if (!Number.isFinite(acoes) || acoes <= 0) {
    return { erro: "Indica quantas ações há em circulação." };
  }
  if (!Number.isFinite(anos) || anos < 1 || anos > MAX_ANOS) {
    return { erro: `Projeta entre 1 e ${MAX_ANOS} anos.` };
  }
  if (!Number.isFinite(r) || r <= 0) {
    return { erro: "A taxa de desconto tem de ser positiva." };
  }
  if (!Number.isFinite(g) || !Number.isFinite(gT)) {
    return { erro: "Os crescimentos têm de ser números." };
  }
  if (gT >= r) {
    return {
      erro:
        "O crescimento perpétuo tem de ser menor do que a taxa de desconto. Igual ou maior, a fórmula do valor terminal divide por zero ou por um número negativo — e devolve um valor enorme ou negativo com ar de resposta. Na prática, nenhuma empresa cresce para sempre acima do custo do capital.",
    };
  }

  /**
   * Onde acaba a primeira fase.
   *
   * Por omissão, a meio: com dez anos de projeção dá 1-5 e 6-10, que é como
   * estes modelos se escrevem em todo o lado.
   */
  const gTardio =
    typeof input.crescimentoTardioPct === "number" && Number.isFinite(input.crescimentoTardioPct)
      ? input.crescimentoTardioPct / 100
      : g;
  const fase1 =
    typeof input.anosPrimeiraFase === "number" && input.anosPrimeiraFase >= 1
      ? Math.min(Math.round(input.anosPrimeiraFase), anos)
      : Math.ceil(anos / 2);

  const projetados: DcfAno[] = [];
  let explicito = 0;
  let ultimo = fcfCents;
  for (let t = 1; t <= anos; t++) {
    ultimo = ultimo * (1 + (t <= fase1 ? g : gTardio));
    const presente = ultimo / Math.pow(1 + r, t);
    projetados.push({
      ano: t,
      fcfCents: Math.round(ultimo),
      presenteCents: Math.round(presente),
      crescimentoPct: Math.round((t <= fase1 ? g : gTardio) * 1000) / 10,
    });
    explicito += presente;
  }

  // Gordon: o fluxo do ano seguinte ao último, a crescer para sempre.
  const terminalBruto = (ultimo * (1 + gT)) / (r - gT);
  const terminal = terminalBruto / Math.pow(1 + r, anos);

  const empresa = explicito + terminal;
  const capitalProprio = empresa - input.dividaLiquidaCents;
  const porAcao = capitalProprio / acoes;

  const preco = input.precoAtualCents ?? null;
  const margem =
    preco !== null && preco > 0 && porAcao > 0 ? ((porAcao - preco) / porAcao) * 100 : null;

  return {
    ok: {
      anos: projetados,
      explicitoCents: Math.round(explicito),
      terminalCents: Math.round(terminal),
      empresaCents: Math.round(empresa),
      capitalProprioCents: Math.round(capitalProprio),
      valorPorAcaoCents: Math.round(porAcao),
      pesoDoTerminalPct: empresa > 0 ? Math.round((terminal / empresa) * 100) : 0,
      margemDeSegurancaPct: margem === null ? null : Math.round(margem),
    },
  };
}

/**
 * O mesmo cálculo com os dois pressupostos que mais mexem no resultado.
 *
 * Um ponto percentual na taxa de desconto e meio ponto no crescimento perpétuo:
 * são variações pequenas e defensáveis, e é isso que torna o exercício
 * eloquente — o intervalo que sai delas costuma ser enorme.
 *
 * As combinações impossíveis são saltadas em silêncio: são um artefacto da
 * variação, não um erro de quem preencheu.
 */
function sensibilidade(base: DcfInput): { label: string; valorPorAcaoCents: number }[] {
  const out: { label: string; valorPorAcaoCents: number }[] = [];
  const variacoes: { label: string; d: number; gT: number }[] = [
    { label: "desconto −1 p.p.", d: -1, gT: 0 },
    { label: "desconto +1 p.p.", d: 1, gT: 0 },
    { label: "perpétuo −0,5 p.p.", d: 0, gT: -0.5 },
    { label: "perpétuo +0,5 p.p.", d: 0, gT: 0.5 },
  ];

  for (const v of variacoes) {
    // O NÚCLEO e não o `calcularDcf`: chamar o de cima daqui é recursão sem
    // fim, e foi o que a primeira versão fez.
    const r = nucleo({
      ...base,
      descontoPct: base.descontoPct + v.d,
      crescimentoPerpetuoPct: base.crescimentoPerpetuoPct + v.gT,
      precoAtualCents: null,
    });
    if ("ok" in r) out.push({ label: v.label, valorPorAcaoCents: r.ok.valorPorAcaoCents });
  }
  return out;
}

/**
 * O intervalo que a sensibilidade desenha, para o ecrã o poder mostrar.
 *
 * Um DCF honesto lê-se assim: "entre X e Y, conforme o que se assumir". O ponto
 * central é o menos importante dos três.
 */
export function intervaloDcf(r: DcfResultado): { minCents: number; maxCents: number } {
  const valores = [r.valorPorAcaoCents, ...r.sensibilidade.map((s) => s.valorPorAcaoCents)];
  return { minCents: Math.min(...valores), maxCents: Math.max(...valores) };
}
