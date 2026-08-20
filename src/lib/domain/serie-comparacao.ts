/**
 * A carteira e o índice, lado a lado ao longo do tempo.
 *
 * **A pergunta que um número sozinho não responde.** "Estás atrás 8 832 €" não
 * diz se o desnível está a abrir ou a fechar — e são conclusões opostas. Uma
 * carteira que esteve 20 mil atrás e hoje está 8 mil está a recuperar; uma que
 * esteve a par e hoje está 8 mil atrás está a perder terreno. O mesmo número.
 *
 * **Os dois lados recebem o mesmo dinheiro nas mesmas datas.** É a única
 * comparação justa: um índice não recebe reforços, e comparar a subida dele com
 * a de uma carteira que foi sendo reforçada trata todo o dinheiro como se
 * tivesse entrado no primeiro dia.
 *
 * **Um mês sem preço de um dos lados não se desenha.** Nem se arrasta o valor
 * do mês anterior, nem se interpola: um ponto inventado no meio de uma série
 * lê-se como uma medição, e a distância entre as duas linhas é precisamente o
 * que se veio aqui ler.
 *
 * Lógica pura, sem acesso a dados.
 */

/** Uma entrada ou saída de dinheiro, com data. Positivo entra. */
export interface FluxoDatado {
  /** "AAAA-MM-DD". */
  date: string;
  amountCents: number;
}

export interface PontoDaComparacao {
  /** "AAAA-MM". */
  mes: string;
  /**
   * O que a carteira valia no fim desse mês: as posições abertas **mais o
   * dinheiro que já tinha voltado** de vendas e dividendos.
   */
  carteiraCents: number;
  /** O que o mesmo dinheiro valeria no índice, com as mesmas saídas. */
  indiceCents: number;
  /** Carteira menos índice. Positivo é estar à frente. */
  diferencaCents: number;
  /** Dinheiro que já tinha **entrado** até esse mês. Saídas não descontam. */
  investidoCents: number;
}

/** O preço de uma coisa em cada dia, já em euros. */
export type PrecosPorDia = Readonly<Record<string, number>>;

/**
 * O preço numa data, ou no dia útil mais próximo antes dela.
 *
 * As bolsas não abrem todos os dias, e o fim de um mês cai em domingo uma vez
 * por ano e meio. Recuar até `maxDias` resolve fins de semana e feriados sem
 * inventar nada — o preço devolvido é sempre um preço que existiu mesmo.
 */
export function precoNoDia(precos: PrecosPorDia, data: string, maxDias = 10): number | null {
  const dia = diaDoPreco(precos, data, maxDias);
  return dia === null ? null : precos[dia]!;
}

/**
 * **Qual** é o dia cujo fecho o `precoNoDia` devolveria.
 *
 * Serve para se poder perguntar se duas datas caem no mesmo fecho. Quando caem,
 * não há período nenhum entre elas por muito que o calendário diga o contrário
 * — e uma variação de 0,0% aí não é "não mexeu", é "não se sabe". Numa
 * segunda-feira, com o último fecho na sexta, as duas pontas de uma janela de
 * um dia caem ambas na sexta.
 */
export function diaDoPreco(precos: PrecosPorDia, data: string, maxDias = 10): string | null {
  const d = new Date(`${data}T00:00:00Z`);
  for (let i = 0; i <= maxDias; i++) {
    const chave = d.toISOString().slice(0, 10);
    const p = precos[chave];
    if (typeof p === "number" && p > 0) return chave;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

/** O último dia de cada mês entre duas datas, inclusive. */
export function fechosDeMes(de: string, ate: string): string[] {
  const out: string[] = [];
  let ano = Number(de.slice(0, 4));
  let mes = Number(de.slice(5, 7));
  const fim = ate.slice(0, 7);

  for (let i = 0; i < 600; i++) {
    const ym = `${ano}-${String(mes).padStart(2, "0")}`;
    if (ym > fim) break;
    // O dia zero do mês seguinte é o último do atual, sem tabelas de dias.
    const ultimo = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
    out.push(ultimo > ate ? ate : ultimo);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

/**
 * A série mês a mês da carteira contra o índice.
 *
 * `carteiraEm` devolve o que a carteira valia numa data, ou `null` quando não
 * se consegue saber — e nesse caso o mês inteiro sai da série, porque comparar
 * um valor que falta com um que existe não é comparar.
 */
export function serieDaComparacao(input: {
  fluxos: readonly FluxoDatado[];
  precosDoIndice: PrecosPorDia;
  /** O valor da carteira numa data, ou `null` se não se souber. */
  carteiraEm: (data: string) => number | null;
  de: string;
  ate: string;
}): PontoDaComparacao[] {
  const { fluxos, precosDoIndice, carteiraEm, de, ate } = input;
  if (!de || !ate || de > ate) return [];

  const ordenados = [...fluxos].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: PontoDaComparacao[] = [];

  for (const dia of fechosDeMes(de, ate)) {
    const carteiraCents = carteiraEm(dia);
    if (carteiraCents === null) continue;

    const precoHoje = precoNoDia(precosDoIndice, dia);
    if (precoHoje === null) continue;

    /**
     * As unidades do índice compradas até esta data, com o dinheiro que entrou.
     *
     * Uma entrada num dia sem cotação — feriado, fim de semana — usa o preço do
     * dia útil anterior. Deitá-la fora tirava dinheiro ao índice e fazia-o
     * parecer pior; dar-lhe o preço de hoje dava-lhe unidades a um preço que
     * não existia na altura.
     */
    let unidades = 0;
    let investidoCents = 0;
    let retiradoCents = 0;
    let algumFluxoSemPreco = false;
    for (const f of ordenados) {
      if (f.date > dia) break;
      const p = precoNoDia(precosDoIndice, f.date);
      if (p === null) {
        algumFluxoSemPreco = true;
        break;
      }
      unidades += f.amountCents / p;
      // O investido é o que se **pôs**. Um líquido encolhia o denominador de
      // quem vendeu e chegava a zero em quem vendeu tudo.
      if (f.amountCents >= 0) investidoCents += f.amountCents;
      else retiradoCents += -f.amountCents;
    }
    // Um mês em que uma entrada não tem preço no índice não se desenha: o
    // índice ficaria com menos dinheiro do que a carteira e a distância entre
    // as linhas passava a medir isso em vez de mercado.
    if (algumFluxoSemPreco) continue;

    /**
     * **O dinheiro que saiu conta nas duas linhas.**
     *
     * O `carteiraEm` devolve o valor das posições **abertas**. Numa venda isso
     * cai, e caía contra um índice que só recebia as entradas e nunca vendia
     * nada — a linha da carteira desabava para zero enquanto a do índice
     * continuava a subir. O desnível que aparecia era feito de dinheiro que
     * está na conta, não de mercado.
     *
     * Somar o retirado aos dois lados põe as duas linhas a medir a mesma
     * coisa: o que este dinheiro vale hoje, esteja onde estiver. A distância
     * entre elas — que é o que este gráfico existe para mostrar — não muda por
     * causa disto, porque é a mesma parcela nos dois.
     */
    const indiceCents = Math.round(unidades * precoHoje) + retiradoCents;
    const carteiraTotalCents = carteiraCents + retiradoCents;
    out.push({
      mes: dia.slice(0, 7),
      carteiraCents: carteiraTotalCents,
      indiceCents,
      diferencaCents: carteiraTotalCents - indiceCents,
      investidoCents,
    });
  }

  return out;
}

/**
 * O desnível está a abrir ou a fechar?
 *
 * Compara o primeiro e o último ponto da série. `null` com menos de dois
 * pontos: uma tendência de um ponto não é tendência.
 */
export function rumoDoDesnivel(
  pontos: readonly PontoDaComparacao[],
): { de: number; para: number; melhorou: boolean } | null {
  if (pontos.length < 2) return null;
  const de = pontos[0]!.diferencaCents;
  const para = pontos[pontos.length - 1]!.diferencaCents;
  return { de, para, melhorou: para > de };
}
