"use client";

/**
 * O imóvel ao preço da zona.
 *
 * **O problema.** Uma casa fica registada pelo valor da escritura e nunca mais
 * se mexe. Ao fim de uns anos o património tem lá um imóvel avaliado ao preço
 * de 2019 — e ninguém repara, porque o número continua lá com o mesmo ar de
 * sempre. Com a área e o concelho, o preço mediano por m² que o INE publica diz
 * quanto é que a casa valeria à mediana da zona.
 *
 * **Isto não é uma avaliação, e o ecrã tem de o dizer.** A mediana do concelho
 * não sabe se a casa é num último andar com vista ou num rés do chão para as
 * traseiras, se está pronta ou a precisar de tudo — e entre uma coisa e outra
 * vão facilmente 30%. Por isso o preço vai para um campo próprio e **não** para
 * o valor: quem decide se o valor muda é quem conhece a casa.
 *
 * **Um nome ambíguo não se desempata sozinho.** Há duas Lagoas em Portugal, uma
 * nos Açores e outra no Algarve, com o dobro do preço uma da outra. Escolher a
 * primeira era acertar por sorte numa em duas, e o erro ficava lá calado.
 */

import { useState, useTransition } from "react";
import { lookupPropertyPriceAction, type InePriceOption } from "@/app/(app)/actions";
import { estimatedPropertyCents, formatCents } from "@/lib/domain";

function plain(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}

function decimal(cents?: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parse(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function PropertyPriceField({
  uid,
  areaM2,
  location,
  priceRefCents,
  priceRefSource,
}: {
  uid: string;
  areaM2?: number | null;
  location?: string | null;
  priceRefCents?: number | null;
  priceRefSource?: string | null;
}) {
  const [area, setArea] = useState(plain(areaM2));
  const [local, setLocal] = useState(location ?? "");
  const [preco, setPreco] = useState(decimal(priceRefCents));
  const [fonte, setFonte] = useState(priceRefSource ?? "");
  const [candidatos, setCandidatos] = useState<InePriceOption[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [aProcurar, procurar] = useTransition();

  const precoCents = (() => {
    const n = parse(preco);
    return n !== null && n > 0 ? Math.round(n * 100) : null;
  })();
  const estimativa = estimatedPropertyCents({ areaM2: parse(area), priceRefCents: precoCents });

  function aplicar(o: InePriceOption, period: string | null) {
    setPreco(decimal(o.pricePerM2Cents));
    setFonte(`INE · ${o.geodsg}${period ? ` · ${period}` : ""}`);
    setCandidatos([]);
  }

  function buscar() {
    setAviso(null);
    setCandidatos([]);
    procurar(async () => {
      const r = await lookupPropertyPriceAction(local);
      if (r.error) {
        setAviso(r.error);
        return;
      }
      setPeriodo(r.period ?? null);
      if (r.escolhido) {
        aplicar(r.escolhido, r.period ?? null);
        // Um nome que só bate por aproximação preenche na mesma, mas diz que
        // foi aproximado: preencher calado é que era enganar.
        if (!r.exato) setAviso(`Assumi ${r.escolhido.geodsg}. Confirma que é esse o concelho.`);
        return;
      }
      setCandidatos(r.candidatos ?? []);
      if ((r.candidatos ?? []).length > 0) setAviso("Há mais do que um sítio com esse nome. Escolhe.");
    });
  }

  return (
    <div className="rounded-xl border border-hair bg-panel2/30 p-4">
      <p className="label mb-1">O imóvel ao preço da zona</p>
      <p className="mb-3 text-xs text-fg-faint">
        Com a área e o concelho, o preço mediano por m² que o INE publica diz
        quanto valeria à mediana da zona. É uma referência, não uma avaliação: a
        mediana do concelho não sabe como é esta casa. O valor lá em cima não se
        mexe sozinho.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`imo-area-${uid}`}>Área (m²)</label>
          <input
            id={`imo-area-${uid}`}
            name="areaM2"
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="90"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`imo-local-${uid}`}>Concelho</label>
          <div className="flex items-center gap-1.5">
            <input
              id={`imo-local-${uid}`}
              name="location"
              maxLength={120}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Vila Nova de Gaia"
              className="input"
            />
            <button
              type="button"
              onClick={buscar}
              disabled={aProcurar || local.trim() === ""}
              className="btn-secondary h-9 shrink-0 whitespace-nowrap px-2.5 text-xs disabled:opacity-40"
            >
              {aProcurar ? "A ver…" : "Ver no INE"}
            </button>
          </div>
        </div>
      </div>

      {aviso ? <p className="mt-2 text-xs text-fg-muted">{aviso}</p> : null}

      {candidatos.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {candidatos.map((c) => (
            <li key={`${c.geodsg}-${c.pricePerM2Cents}`}>
              <button
                type="button"
                onClick={() => aplicar(c, periodo)}
                className="rounded-full border border-hair px-2.5 py-1 text-xs text-fg-muted transition hover:border-fg/30 hover:text-fg"
              >
                {c.geodsg} — {formatCents(c.pricePerM2Cents)}/m²
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`imo-preco-${uid}`}>Preço de referência (€/m²)</label>
          <input
            id={`imo-preco-${uid}`}
            name="priceRefEurM2"
            inputMode="decimal"
            value={preco}
            onChange={(e) => {
              setPreco(e.target.value);
              // Escrito à mão deixa de ser do INE, e a proveniência tem de
              // acompanhar: um preço com a etiqueta errada é pior do que um
              // preço sem etiqueta nenhuma.
              setFonte("escrito à mão");
            }}
            placeholder="2 000,00"
            className="input"
          />
          <input type="hidden" name="priceRefSource" value={fonte} />
        </div>
        <div>
          <p className="label">À mediana da zona</p>
          <p className="text-sm text-fg">
            {estimativa === null ? (
              <span className="text-fg-faint">falta a área ou o preço</span>
            ) : (
              formatCents(estimativa)
            )}
          </p>
          {fonte ? <p className="mt-0.5 text-xs text-fg-faint">{fonte}</p> : null}
        </div>
      </div>
    </div>
  );
}
