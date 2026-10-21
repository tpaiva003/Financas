"use client";

/**
 * A fatia deste bem que é deste ambiente.
 *
 * **O problema.** Um bem contava sempre por inteiro. Quem compra uma casa a
 * meias via 300 mil de imóvel e 200 mil de dívida, quando o que é seu são 150 e
 * 100. O que torna isto perigoso é que os dois erros se disfarçam um ao outro —
 * o património líquido até dava certo, e por isso ninguém desconfiava —
 * enquanto o valor bruto, o total das dívidas e a prestação mentiam ao dobro.
 *
 * **A quota faz sempre e só uma coisa: multiplica o valor.** Sem exceções
 * escondidas. Quem tem o resto é um campo à parte, para o registo, e não entra
 * em conta nenhuma. Se o co-proprietário for alguém deste ambiente, a app
 * **diz** que nesse caso a quota provavelmente devia ser 100% — mas não muda
 * nada sozinha: uma app que corrige números de dinheiro por dedução própria é
 * uma app em que não se pode confiar no número que mostra.
 */

import { useState } from "react";

/** Um membro do ambiente, o mínimo para se poder escolher. */
export interface OwnershipMember {
  id: string;
  name: string;
}

const ATALHOS = [50, 100] as const;

function plain(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}

function parse(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function OwnershipField({
  uid,
  members,
  ownershipPct,
  coOwnerMemberId,
  /** Palavra para o bem, para o texto não dizer sempre "bem". */
  noun = "bem",
}: {
  uid: string;
  members: OwnershipMember[];
  ownershipPct?: number | null;
  coOwnerMemberId?: string | null;
  noun?: string;
}) {
  const [quota, setQuota] = useState(plain(ownershipPct));
  const [coOwner, setCoOwner] = useState(coOwnerMemberId ?? "");

  const n = parse(quota);
  const parcial = n !== null && n > 0 && n < 100;
  // As duas metades dentro do mesmo ambiente: o ambiente tem o bem todo, e
  // pôr aqui 50% faria o património contar só metade de uma coisa que é toda
  // dele. Diz-se; não se corrige por conta própria.
  const ambosCa = parcial && coOwner !== "";

  return (
    <div className="rounded-xl border border-hair bg-panel2/30 p-4">
      <p className="label mb-1">Quanto deste {noun} é teu</p>
      <p className="mb-3 text-xs text-fg-faint">
        Em branco ou 100% conta por inteiro. Numa casa comprada a meias, 50% faz
        o património e a dívida contarem só a tua parte, que é a única forma de
        os dois números serem verdade ao mesmo tempo.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`own-pct-${uid}`}>A tua quota (%)</label>
          <div className="flex items-center gap-1.5">
            <input
              id={`own-pct-${uid}`}
              name="ownershipPct"
              inputMode="decimal"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              placeholder="100"
              className="input"
            />
            {ATALHOS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setQuota(String(v))}
                className={`h-9 shrink-0 rounded-full border px-2.5 text-xs transition ${
                  n === v
                    ? "border-fg bg-fg text-bg"
                    : "border-hair bg-transparent text-fg-muted hover:border-fg/30"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {members.length > 0 ? (
          <div>
            <label className="label" htmlFor={`own-co-${uid}`}>Quem tem o resto</label>
            <select
              id={`own-co-${uid}`}
              name="coOwnerMemberId"
              value={coOwner}
              onChange={(e) => setCoOwner(e.target.value)}
              className="select"
            >
              <option value="">Alguém de fora da app</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-fg-faint">
              Só para o registo: não entra em conta nenhuma.
            </p>
          </div>
        ) : null}
      </div>

      {ambosCa ? (
        <p className="mt-3 text-xs text-fg-muted">
          As duas metades estão as duas neste ambiente, e o património do
          ambiente é a soma das duas. Com 50% aqui, ele passa a contar só a tua:
          o que é o que queres se leres o património como teu, e não é se o
          leres como da casa. Fica como está se for de propósito.
        </p>
      ) : null}
    </div>
  );
}
