/**
 * Limites de um ambiente gratuito.
 *
 * Abrir o registo a qualquer pessoa foi uma decisão de produto. Sem tectos, essa
 * decisão transforma a app em alojamento gratuito de dados financeiros de
 * desconhecidos: custa dinheiro, cria obrigações de RGPD sobre dados que ninguém
 * pediu para guardar, e convida a abuso.
 *
 * Os números aqui não são para irritar quem experimenta — são para deixar
 * **experimentar tudo** e não deixar viver lá dentro. Cem despesas chegam para
 * ver um saldo a formar-se, a divisão a funcionar e um relatório a fazer sentido.
 * Dez investimentos chegam para ver uma carteira com rentabilidade. Duas pessoas
 * são o produto inteiro: isto é uma app de contas partilhadas entre duas pessoas.
 *
 * Três regras que valem mais do que os números:
 *
 * 1. **Nunca se apaga nada por causa de um limite.** Um tecto impede de criar
 *    mais, não faz desaparecer o que já lá está. Dados financeiros de alguém não
 *    somem porque uma linha de configuração mudou.
 * 2. **Diz-se sempre quanto falta, antes de acabar.** Uma pessoa que bate no
 *    tecto sem aviso sente-se enganada; uma que o vê a chegar, decide.
 * 3. **O tecto é do ambiente, não da pessoa.** É o que se pode medir e cobrar,
 *    e não muda quando alguém entra ou sai.
 *
 * Lógica pura, sem acesso a dados.
 */

/** O que um ambiente pode fazer. `full` não tem tectos. */
export type SpacePlan = "free" | "full";

/** As coisas que se contam. */
export type LimitKind = "expenses" | "assets" | "members" | "spaces";

export interface Limits {
  expenses: number;
  assets: number;
  members: number;
  /** Ambientes que uma pessoa pode criar. */
  spaces: number;
}

/**
 * Os tectos do plano gratuito.
 *
 * Escolhidos para caber a experiência toda e não caber uma vida inteira de
 * registos. Se algum destes número precisar de mudar, muda-se aqui e em mais
 * lado nenhum.
 */
export const FREE_LIMITS: Limits = {
  expenses: 100,
  assets: 10,
  // Duas pessoas é o produto, não uma restrição: a app existe para dividir
  // contas entre duas pessoas.
  members: 2,
  spaces: 1,
};

/** Quando se avisa que o tecto está a chegar: nos últimos 20%, no mínimo 3. */
const MARGEM = 0.2;

export function limitsFor(plan: SpacePlan): Limits | null {
  return plan === "full" ? null : FREE_LIMITS;
}

export interface LimitCheck {
  /** Pode criar mais um? */
  allowed: boolean;
  /** Quantos ainda cabem. `null` quando não há tecto. */
  remaining: number | null;
  /** O tecto, para se poder mostrar "12 de 100". `null` quando não há. */
  limit: number | null;
  /** Vale a pena avisar que está a acabar. */
  nearLimit: boolean;
  /** O que dizer a quem está a olhar. `null` quando não há nada a dizer. */
  message: string | null;
}

const NOMES: Record<LimitKind, { singular: string; plural: string }> = {
  expenses: { singular: "despesa", plural: "despesas" },
  assets: { singular: "bem", plural: "bens" },
  members: { singular: "pessoa", plural: "pessoas" },
  spaces: { singular: "ambiente", plural: "ambientes" },
};

/**
 * Cabe mais um?
 *
 * `current` é quantos já existem. Um ambiente que já passou o tecto (porque o
 * plano mudou, ou porque os números aqui desceram) **não perde nada**: só deixa
 * de poder criar mais. É a diferença entre um limite e um castigo.
 */
export function checkLimit(kind: LimitKind, current: number, plan: SpacePlan): LimitCheck {
  const limits = limitsFor(plan);
  if (!limits) {
    return { allowed: true, remaining: null, limit: null, nearLimit: false, message: null };
  }

  const limit = limits[kind];
  const remaining = Math.max(0, limit - current);
  const nome = NOMES[kind];

  if (remaining === 0) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      nearLimit: true,
      message:
        kind === "members"
          ? `Um ambiente gratuito vai até ${limit} pessoas. O que já lá está mantém-se.`
          : `Chegaste às ${limit} ${nome.plural} de um ambiente gratuito. Nada se perde — só não dá para acrescentar mais.`,
    };
  }

  const margem = Math.max(3, Math.round(limit * MARGEM));
  const nearLimit = remaining <= margem;

  return {
    allowed: true,
    remaining,
    limit,
    nearLimit,
    message: nearLimit
      ? `Falta${remaining === 1 ? "" : "m"} ${remaining} ${remaining === 1 ? nome.singular : nome.plural} até ao limite do ambiente gratuito.`
      : null,
  };
}

/**
 * O plano de um ambiente novo.
 *
 * Quem está na lista de emails das variáveis de ambiente são os donos da casa e
 * não levam tectos. Toda a gente que se registou sozinha começa no gratuito.
 */
export function planForNewSpace(isEnvAllowed: boolean): SpacePlan {
  return isEnvAllowed ? "full" : "free";
}
