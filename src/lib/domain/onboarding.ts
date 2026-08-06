/**
 * Primeiros passos, para quem entra e vê um saldo a zero.
 *
 * A app tem quatro secções e catorze páginas. Quem chega pela primeira vez não
 * faz ideia por onde começar, e um ecrã vazio não ensina nada.
 *
 * Duas decisões que fazem a diferença entre isto ajudar e isto irritar:
 *
 * 1. **Os passos completam-se sozinhos**, a partir dos dados. Não há nada para
 *    marcar como feito: regista uma despesa e o passo fica feito. Listas onde é
 *    preciso confirmar manualmente que se fez algo são trabalho a mais.
 * 2. **Desaparece quando acaba**, sem pedir licença. Um cartão de boas-vindas
 *    que fica para sempre passa a ruído em três dias.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface OnboardingFacts {
  expenseCount: number;
  /** Participantes do ambiente, incluindo o próprio. */
  memberCount: number;
  importCount: number;
  incomeCount: number;
}

export interface OnboardingStep {
  id: "despesa" | "pessoas" | "importar" | "rendimento";
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface Onboarding {
  steps: OnboardingStep[];
  doneCount: number;
  total: number;
  /** Está tudo feito: o cartão deixa de fazer sentido. */
  complete: boolean;
  /** O próximo passo por fazer, para se poder destacar. */
  next: OnboardingStep | null;
}

export function buildOnboarding(facts: OnboardingFacts): Onboarding {
  const steps: OnboardingStep[] = [
    {
      id: "despesa",
      title: "Regista a primeira despesa",
      description: "Um café, as compras, o que for. É assim que a app começa a servir para alguma coisa.",
      href: "/despesas/nova",
      cta: "Registar despesa",
      done: facts.expenseCount > 0,
    },
    {
      id: "pessoas",
      title: "Junta quem divide contigo",
      description: "Sem mais ninguém no ambiente, não há contas para acertar.",
      href: "/ambiente",
      cta: "Adicionar pessoas",
      done: facts.memberCount > 1,
    },
    {
      id: "importar",
      title: "Traz o extrato do banco",
      description: "Põe semanas em dia de uma vez, em vez de escreveres despesa a despesa.",
      href: "/importar",
      cta: "Importar extrato",
      done: facts.importCount > 0,
    },
    {
      id: "rendimento",
      title: "Diz o que recebes",
      description: "É o que falta para saberes que percentagem do que entra é que fica.",
      href: "/rendimentos",
      cta: "Registar rendimento",
      done: facts.incomeCount > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}
