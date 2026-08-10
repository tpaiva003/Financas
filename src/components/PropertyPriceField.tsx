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
import {
  lookupPropertyPriceAction,
  type InePriceIndice,
  type InePriceOption,
} from "@/app/(app)/actions";
import {
  custoTotalImovel,
  estimatedPropertyCents,
  formatCents,
  valorImovelPeloIndice,
} from "@/lib/domain";

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
  priceRefGeocod,
  purchasePriceCents,
  worksCents,
  purchasedAt,
}: {
  uid: string;
  areaM2?: number | null;
  location?: string | null;
  priceRefCents?: number | null;
  priceRefSource?: string | null;
  priceRefGeocod?: string | null;
  purchasePriceCents?: number | null;
  worksCents?: number | null;
  /** A data da escritura, para se ir buscar o índice da altura. */
  purchasedAt?: string | null;
}) {
  const [area, setArea] = useState(plain(areaM2));
  const [local, setLocal] = useState(location ?? "");
  const [preco, setPreco] = useState(decimal(priceRefCents));
  const [fonte, setFonte] = useState(priceRefSource ?? "");
  const [geocod, setGeocod] = useState(priceRefGeocod ?? "");
  const [compra, setCompra] = useState(decimal(purchasePriceCents));
  const [obras, setObras] = useState(decimal(worksCents));
  const [indice, setIndice] = useState<InePriceIndice | null>(null);
  const [candidatos, setCandidatos] = useState<InePriceOption[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [aProcurar, procurar] = useTransition();

  const precoCents = (() => {
    const n = parse(preco);
    return n !== null && n > 0 ? Math.round(n * 100) : null;
  })();
  const estimativa = estimatedPropertyCents({ areaM2: parse(area), priceRefCents: precoCents });

  const cents = (v: string) => {
    const n = parse(v);
    return n !== null && n > 0 ? Math.round(n * 100) : null;
  };
  const custoCents = custoTotalImovel({
    purchasePriceCents: cents(compra),
    worksCents: cents(obras),
  });

  /**
   * O valor pelo índice: o que custou, a acompanhar a valorização da zona
   * desde a escritura. É a conta que sabe alguma coisa sobre ESTA casa — a
   * outra sabe sobre a casa média da zona.
   */
  const pelosIndices = valorImovelPeloIndice({
    custoCents,
    indiceCompra: indice?.naCompra ?? null,
    indiceHoje: indice?.hoje ?? null,
  });

  function aplicar(o: InePriceOption, period: string | null) {
    setPreco(decimal(o.pricePerM2Cents));
    // A proveniência leva o sítio E o período: esta série é trimestral e sai
    // com atraso, e sem a data um valor de há dois anos passa por atual.
    setFonte(`INE · ${o.geodsg}${period ? ` · ${period}` : ""}`);
    setGeocod(o.geocod);
    setIndice(o.indice ?? null);
    setCandidatos([]);
  }

  function buscar() {
    setAviso(null);
    setCandidatos([]);
    procurar(async () => {
      const r = await lookupPropertyPriceAction(local, purchasedAt ?? null);
      if (r.error) {
        setAviso(r.error);
        return;
      }
      setPeriodo(r.period ?? null);
      if (r.escolhido) {
        aplicar(r.escolhido, r.period ?? null);
        // Um nome que só bate por aproximação preenche na mesma, mas diz que
        // foi aproximado: preencher calado é que era enganar.
        if (!r.exato) {
          setAviso(
            `Assumi ${r.escolhido.geodsg}${r.escolhido.dentroDe ? `, em ${r.escolhido.dentroDe}` : ""}. Confirma que é esse o sítio.`,
          );
        }
        return;
      }
      setCandidatos(r.candidatos ?? []);
      if ((r.candidatos ?? []).length > 0) {
        setAviso("Há mais do que um sítio com esse nome. Escolhe qual — os preços são diferentes.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-hair bg-panel2/30 p-4">
      <p className="label mb-1">O imóvel ao preço da zona</p>
      <p className="mb-3 text-xs text-fg-faint">
        Com a área e o sítio, o preço mediano por m² que o INE publica diz
        quanto valeria à mediana da zona. É uma referência, não uma avaliação: a
        mediana não sabe como é esta casa. O valor lá em cima não se mexe
        sozinho. Escreve o concelho — ou a freguesia e o concelho, como numa
        morada: &quot;Paranhos, Porto&quot;.
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`imo-compra-${uid}`}>Quanto custou</label>
          <input
            id={`imo-compra-${uid}`}
            name="purchasePrice"
            inputMode="decimal"
            value={compra}
            onChange={(e) => setCompra(e.target.value)}
            placeholder="125 000,00"
            className="input"
          />
          <p className="mt-1 text-xs text-fg-faint">
            O da escritura. É o único número que se sabe de certeza sobre esta
            casa — o valor de hoje estima-se a partir dele.
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`imo-obras-${uid}`}>Obras desde então</label>
          <input
            id={`imo-obras-${uid}`}
            name="works"
            inputMode="decimal"
            value={obras}
            onChange={(e) => setObras(e.target.value)}
            placeholder="0,00"
            className="input"
          />
          <p className="mt-1 text-xs text-fg-faint">
            Entram pelo que custaram. Uma cozinha feita o ano passado não
            valorizou desde a escritura.
          </p>
        </div>
      </div>

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
          <label className="label" htmlFor={`imo-local-${uid}`}>Concelho ou freguesia</label>
          <div className="flex items-center gap-1.5">
            <input
              id={`imo-local-${uid}`}
              name="location"
              maxLength={120}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Paranhos, Porto"
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
            <li key={`${c.geodsg}-${c.dentroDe ?? ""}-${c.pricePerM2Cents}`}>
              {/* O "dentro de" não é decoração: Odivelas é concelho e é
                  freguesia dentro dele, e sem isto os dois botões ficavam
                  iguais com preços diferentes. */}
              <button
                type="button"
                onClick={() => aplicar(c, periodo)}
                className="rounded-full border border-hair px-2.5 py-1 text-left text-xs text-fg-muted transition hover:border-fg/30 hover:text-fg"
              >
                {c.geodsg}
                {c.dentroDe ? <span className="text-fg-faint"> · em {c.dentroDe}</span> : null}
                {" — "}
                {formatCents(c.pricePerM2Cents)}/m²
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

      <input type="hidden" name="priceRefGeocod" value={geocod} />

      {/*
        As duas contas lado a lado, de propósito. A de cima sabe sobre a casa
        MÉDIA daquela zona com aquele tamanho; esta sabe sobre ESTA casa, porque
        parte do que se pagou por ela. Discordarem uma da outra é informação —
        e é por isso que nenhuma delas mexe no valor sozinha.
      */}
      <div className="mt-4 rounded-lg border border-hair bg-bg/40 p-3">
        <p className="label mb-1">O que custou, com a valorização da zona</p>
        {pelosIndices ? (
          <>
            <p className="font-mono text-base tnum text-fg">
              {formatCents(pelosIndices.valueCents)}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-fg-faint">
              {formatCents(pelosIndices.custoCents)} de custo, e a zona subiu{" "}
              {Math.round((pelosIndices.fator - 1) * 100)}% de{" "}
              {pelosIndices.periodoCompra} para {pelosIndices.periodoHoje} (
              {formatCents(pelosIndices.indiceCompraCents)}/m² para{" "}
              {formatCents(pelosIndices.indiceHojeCents)}/m²).
            </p>
          </>
        ) : (
          <p className="text-xs text-fg-faint">
            {custoCents === null
              ? "Escreve quanto custou para eu poder estimar."
              : !purchasedAt
                ? "Falta a data de compra lá em cima: sem ela não sei de quando contar a valorização."
                : "Carrega em “Ver no INE” para eu ir buscar o índice da altura da compra e o de agora."}
          </p>
        )}
      </div>

    </div>
  );
}
