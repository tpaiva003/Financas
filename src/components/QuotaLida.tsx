"use client";

/**
 * A parte de cada um numa divisão por percentagem, dita como se lê.
 *
 * Num rendimento mostra-se o que cada um **recebe**, em euros positivos: um
 * "−70,00 €" ao lado de "70%" lia-se como uma dívida, quando é dinheiro a
 * entrar. Numa despesa fica como sempre esteve — sem verbo, porque a
 * quota-parte é o que cada um suporta e não o que paga, e quem pagou é
 * independente de como se divide.
 *
 * Vive à parte porque são dois formulários a mostrar a mesma linha, o de criar
 * e o de editar: duas cópias divergiam à primeira correção, e a que ficasse
 * para trás dizia o contrário da outra sobre o mesmo dinheiro.
 */

import { formatCents } from "@/lib/domain";

export function QuotaLida({
  nome,
  pct,
  cents,
  verbo,
}: {
  nome: string;
  pct: number;
  cents: number;
  /** O verbo a pôr antes do valor, ou `null` para o deixar nu (despesa). */
  verbo: string | null;
}) {
  return (
    <span>
      {nome}: {pct}%
      {cents ? (
        <>
          {" · "}
          {verbo ? `${verbo} ` : ""}
          <span className="dinheiro">{formatCents(verbo ? Math.abs(cents) : cents)}</span>
        </>
      ) : (
        ""
      )}
    </span>
  );
}
