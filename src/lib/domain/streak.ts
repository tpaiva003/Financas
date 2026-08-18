/**
 * O streak de registos: dias seguidos em que a pessoa meteu dados na app.
 *
 * **O que conta é o dia do REGISTO, não a data da despesa.** O hábito que se
 * quer alimentar é abrir a app e manter as contas em dia — registar hoje um
 * jantar de sábado conta hoje, que foi quando o trabalho se fez. É a mesma
 * régua da "última atividade" do dashboard. Um import de extrato conta como um
 * dia (o dia em que foi feito), não como trinta.
 *
 * **Sem tabela nova, de propósito.** O streak deriva-se do `createdAt` das
 * despesas que já existem: nada para migrar, nada para ficar dessincronizado,
 * e apagar a conta apaga o streak com ela.
 *
 * **Um dia sem registar ainda não perde o streak de ontem.** Quem registou
 * ontem e abre a app hoje vê o streak vivo com o aviso de que é hoje que ele
 * se mantém — perder tudo às 00:01 é desmotivar precisamente quem vinha
 * registar.
 */

export interface Streak {
  /** Dias seguidos, a contar até hoje (ou até ontem, se hoje ainda não há). */
  atual: number;
  /** A melhor sequência de sempre. */
  recorde: number;
  /** Já há registo hoje? Se não, o `atual` só sobrevive registando hoje. */
  registadoHoje: boolean;
}

function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * `dias` são datas "AAAA-MM-DD" com pelo menos um registo (repetidos não fazem
 * mal); `hoje` vem de fora para isto ser testável sem relógio.
 */
export function streakDeRegistos(dias: Iterable<string>, hoje: string): Streak {
  const set = new Set(dias);
  const registadoHoje = set.has(hoje);

  // A sequência atual: começa hoje se há registo hoje, senão ainda se conta a
  // que acaba ontem — é a que está em risco.
  let atual = 0;
  let cursor = registadoHoje ? hoje : diaAnterior(hoje);
  while (set.has(cursor)) {
    atual += 1;
    cursor = diaAnterior(cursor);
  }

  // O recorde: a maior sequência em todo o histórico. Percorre-se cada início
  // de sequência (dia sem véspera registada) e mede-se para a frente — linear
  // no número de dias distintos.
  let recorde = atual;
  for (const dia of set) {
    if (set.has(diaAnterior(dia))) continue; // não é um início
    let tamanho = 0;
    let d = dia;
    while (set.has(d)) {
      tamanho += 1;
      d = proximoDia(d);
    }
    if (tamanho > recorde) recorde = tamanho;
  }

  return { atual, recorde, registadoHoje };
}

function proximoDia(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
