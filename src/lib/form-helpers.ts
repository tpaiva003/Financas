/**
 * Os ajudantes que as Server Actions partilham.
 *
 * **Vivem fora do `actions.ts` por uma razão técnica e outra prática.** A
 * técnica: um ficheiro `"use server"` só pode exportar funções assíncronas, por
 * isso um ajudante síncrono partilhado não pode sair de lá — fica preso, e
 * qualquer ficheiro que se separe do `actions.ts` deixa de lhe chegar. A
 * prática: são funções puras sobre texto de formulário e mensagens de erro, sem
 * nada de servidor, e é aqui que se testam sem servidor nenhum à volta.
 */

import { toCents } from "@/lib/domain";

/**
 * Um número escrito à portuguesa, ou à inglesa, ou às duas.
 *
 * "1.234,56" e "1,234.56" querem dizer o mesmo em sítios diferentes. Quando
 * aparecem os dois separadores, o que vem por último é o decimal; quando só
 * aparece a vírgula, é ela.
 */
export function normalizeAmount(v: unknown): unknown {
  if (typeof v !== "string") return v;
  let s = v.trim().replace(/\s/g, "");

  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");

  if (virgula >= 0 && ponto >= 0) {
    /**
     * **O separador que vem por último é o decimal.**
     *
     * A versão anterior assumia sempre "ponto = milhares, vírgula = decimal", o
     * que acerta em "1.234,56" e falha em "1,234.56" — o formato inglês, que é
     * o que sai de meia dúzia de extratos e de qualquer coisa copiada de um
     * site americano. Nesse caso devolvia **1,23456**: mil vezes menos, com o
     * ar de um número perfeitamente normal.
     */
    if (virgula > ponto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (virgula >= 0) {
    // Só vírgula: é o decimal. "1,5" são um e meio, não mil e quinhentos.
    s = s.replace(",", ".");
  }

  return s;
}

/**
 * Um valor em cêntimos a partir do que veio no formulário.
 *
 * `null` quando o campo está vazio — que é diferente de inválido — e `NaN`
 * quando lá está alguma coisa que não é um valor positivo. Quem chama distingue
 * os dois: um campo vazio pode ser opcional, um campo com lixo nunca é.
 */
export function parseAmountCents(raw: unknown): number | null {
  const s = String(normalizeAmount(String(raw ?? "")) ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return NaN as unknown as number; // sinaliza inválido
  return toCents(n);
}

/**
 * Porque é que não gravou, dito a quem consegue resolver.
 *
 * **O motivo em cru vai lá, e é de propósito.** "Não consegui gravar" é verdade
 * e não serve para nada: não distingue uma migração por correr de um número que
 * a coluna não aceita nem de uma falha de rede, e obriga a adivinhar em rondas.
 * O texto do PostgREST é feio mas diz qual é a coluna e qual é o valor — e quem
 * está a olhar para este ecrã é o dono dos dados, não um estranho.
 */
export function porqueNaoGravou(e: unknown, oQue = "isto"): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const coluna = msg.match(/'([a-z_]+)' column|column "([a-z_]+)"/i);
  const nome = coluna?.[1] ?? coluna?.[2] ?? null;
  if (nome) {
    return `A base de dados ainda não tem a coluna "${nome}". Falta correr a migração que a cria — até lá, não gravo para não perder o que escreveste.`;
  }
  if (/relation .* does not exist/i.test(msg)) {
    return "A base de dados ainda não tem esta tabela. Falta correr as migrações.";
  }
  const detalhe = msg.trim().slice(0, 200);
  return detalhe ? `Não consegui gravar ${oQue}: ${detalhe}` : `Não consegui gravar ${oQue}.`;
}
