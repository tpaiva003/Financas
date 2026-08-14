/**
 * Crescimento de uso da plataforma.
 *
 * A consola sabia dizer **quanto** existe — contas, ambientes, despesas — e não
 * sabia dizer se isso está a **aumentar**. Um total que só sobe parece sempre
 * bom: 40 ambientes é o mesmo número quer tenham chegado todos no mês passado
 * quer nenhum tenha aparecido desde o Natal. São situações opostas.
 *
 * **A data que conta é a de registo, nunca a da transação.** Uma pessoa que
 * importa dois anos de extrato numa noite gera despesas datadas de 2024 — e uma
 * curva construída sobre `transaction_date` desenhava dois anos de uso a partir
 * de uma noite de uso. Seria o gráfico mais bonito e mais falso desta app.
 * Aqui, um evento é o momento em que o registo **entrou** na app.
 *
 * **Percentagens em números pequenos são ruído.** "100% de retenção" com um
 * ambiente elegível é verdade e não quer dizer nada; "+50% de contas" quando
 * passaram de duas para três é a mesma coisa. Por isso as percentagens só saem
 * acima de um mínimo, e por baixo mostra-se "2 de 3", que ninguém confunde com
 * uma tendência.
 *
 * Lógica pura, sem acesso a dados. Continua a valer a regra da consola:
 * contagens e datas, nunca conteúdo.
 */

/** Um registo qualquer que entrou na app, e em que ambiente. */
export interface EventoDeUso {
  spaceId: string;
  /** Quando ENTROU na app (`created_at`), não a data do que representa. */
  createdAt: string;
}

export interface CrescimentoInput {
  /** "YYYY-MM-DD". Entra por argumento para os testes não dependerem do relógio. */
  hoje: string;
  /** `created_at` de cada conta. */
  contas: string[];
  ambientes: { id: string; createdAt: string }[];
  eventos: EventoDeUso[];
  /** Quantos meses de série. Omitido = 12. */
  meses?: number;
}

export interface MesDeUso {
  /** "YYYY-MM". */
  mes: string;
  contasNovas: number;
  ambientesNovos: number;
  /** Registos criados nesse mês, em toda a plataforma. */
  registosNovos: number;
  /** Ambientes com pelo menos um registo criado nesse mês. */
  ambientesAtivos: number;
}

export interface JanelaDeUso {
  dias: number;
  contasNovas: number;
  ambientesNovos: number;
  registosNovos: number;
  ambientesAtivos: number;
}

/**
 * Uma proporção com o denominador à vista.
 *
 * `pct` é `null` quando a base é pequena de mais para uma percentagem dizer
 * alguma coisa. Não é timidez: é a diferença entre "67%" e "2 de 3".
 */
export interface Proporcao {
  de: number;
  quantos: number;
  pct: number | null;
}

export interface Crescimento {
  /** Do mês mais antigo para o mais recente, sem saltar meses vazios. */
  meses: MesDeUso[];
  janelas: JanelaDeUso[];
  /**
   * Dos ambientes com mais de 30 dias, quantos voltaram a registar alguma coisa
   * nos últimos 30. É a pergunta "isto ainda é usado depois da curiosidade".
   */
  retencao: Proporcao;
  /**
   * Dos ambientes com mais de 7 dias, quantos registaram alguma coisa na
   * primeira semana. Um ambiente que nasce e nunca arranca não é um utilizador.
   */
  ativacao: Proporcao;
  /** Ambientes que nunca registaram nada, de todo. */
  semQualquerRegisto: number;
}

/** Abaixo disto, uma percentagem engana mais do que informa. Ver o cabeçalho. */
export const MINIMO_PARA_PERCENTAGEM = 5;

const DIA = 86_400_000;

function dia(iso: string): string {
  return iso.slice(0, 10);
}

function tempo(iso: string): number {
  // "2026-08-10" e "2026-08-10T12:00:00Z" comparam-se os dois a partir daqui.
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? 0 : t;
}

/** "YYYY-MM-DD" menos N dias, em "YYYY-MM-DD". */
export function menosDias(hoje: string, dias: number): string {
  return new Date(tempo(hoje) - dias * DIA).toISOString().slice(0, 10);
}

function proporcao(quantos: number, de: number): Proporcao {
  return {
    de,
    quantos,
    pct: de >= MINIMO_PARA_PERCENTAGEM ? Math.round((quantos / de) * 100) : null,
  };
}

/** Os últimos N meses até ao de `hoje`, inclusive, do mais antigo ao mais novo. */
function ultimosMeses(hoje: string, quantos: number): string[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const out: string[] = [];
  for (let i = quantos - 1; i >= 0; i--) {
    // Um mês de cada vez a partir de uma data segura do mês (dia 1, em UTC):
    // somar/subtrair 30 dias salta meses de 31 e repete meses de 28.
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function buildCrescimento(input: CrescimentoInput): Crescimento {
  const hoje = dia(input.hoje);
  const quantosMeses = input.meses ?? 12;

  const eventos = input.eventos.filter((e) => e.spaceId && e.createdAt);

  // ---- Série mensal. Meses sem nada entram na mesma: um buraco é informação,
  // e uma série que salta os meses vazios desenha uma linha contínua por cima
  // de dois meses parados.
  const contasPorMes = new Map<string, number>();
  for (const c of input.contas) {
    const m = c.slice(0, 7);
    contasPorMes.set(m, (contasPorMes.get(m) ?? 0) + 1);
  }
  const ambientesPorMes = new Map<string, number>();
  for (const a of input.ambientes) {
    const m = a.createdAt.slice(0, 7);
    ambientesPorMes.set(m, (ambientesPorMes.get(m) ?? 0) + 1);
  }
  const registosPorMes = new Map<string, number>();
  const ativosPorMes = new Map<string, Set<string>>();
  for (const e of eventos) {
    const m = e.createdAt.slice(0, 7);
    registosPorMes.set(m, (registosPorMes.get(m) ?? 0) + 1);
    const s = ativosPorMes.get(m) ?? new Set<string>();
    s.add(e.spaceId);
    ativosPorMes.set(m, s);
  }

  const meses: MesDeUso[] = ultimosMeses(hoje, quantosMeses).map((m) => ({
    mes: m,
    contasNovas: contasPorMes.get(m) ?? 0,
    ambientesNovos: ambientesPorMes.get(m) ?? 0,
    registosNovos: registosPorMes.get(m) ?? 0,
    ambientesAtivos: ativosPorMes.get(m)?.size ?? 0,
  }));

  // ---- Janelas recentes.
  const janelas: JanelaDeUso[] = [7, 30, 90].map((dias) => {
    const desde = menosDias(hoje, dias);
    const doPeriodo = eventos.filter((e) => dia(e.createdAt) >= desde);
    return {
      dias,
      contasNovas: input.contas.filter((c) => dia(c) >= desde).length,
      ambientesNovos: input.ambientes.filter((a) => dia(a.createdAt) >= desde).length,
      registosNovos: doPeriodo.length,
      ambientesAtivos: new Set(doPeriodo.map((e) => e.spaceId)).size,
    };
  });

  // ---- Retenção: dos ambientes que já tiveram tempo, quantos voltaram.
  const ha30 = menosDias(hoje, 30);
  const antigos = input.ambientes.filter((a) => dia(a.createdAt) < ha30);
  const ativosRecentes = new Set(eventos.filter((e) => dia(e.createdAt) >= ha30).map((e) => e.spaceId));
  const retencao = proporcao(
    antigos.filter((a) => ativosRecentes.has(a.id)).length,
    antigos.length,
  );

  // ---- Ativação: quem nasceu há mais de uma semana chegou a usar na primeira?
  const ha7 = menosDias(hoje, 7);
  const comSemana = input.ambientes.filter((a) => dia(a.createdAt) < ha7);
  const primeiroEvento = new Map<string, string>();
  for (const e of eventos) {
    const atual = primeiroEvento.get(e.spaceId);
    if (!atual || e.createdAt < atual) primeiroEvento.set(e.spaceId, e.createdAt);
  }
  const ativacao = proporcao(
    comSemana.filter((a) => {
      const p = primeiroEvento.get(a.id);
      if (!p) return false;
      // Sete dias a contar do nascimento do ambiente, não do calendário.
      return tempo(p) - tempo(a.createdAt) <= 7 * DIA;
    }).length,
    comSemana.length,
  );

  const comRegisto = new Set(eventos.map((e) => e.spaceId));
  const semQualquerRegisto = input.ambientes.filter((a) => !comRegisto.has(a.id)).length;

  return { meses, janelas, retencao, ativacao, semQualquerRegisto };
}
