"use client";

/**
 * Os períodos de taxa de um crédito à habitação.
 *
 * **O problema que resolve.** Uma dívida guardava uma taxa e um tipo, e um
 * crédito à habitação português não tem uma taxa — tem duas ou três, com datas:
 * "3 anos fixa a 3,3%, depois Euribor 6M + 0,9% até 2055". Com uma taxa só, a
 * app mostrava até ao fim uma prestação que deixa de ser verdade no dia em que
 * o período fixo acaba.
 *
 * **Fixa, mista ou variável é um atalho, não um campo.** O botão em cima não
 * grava nada: monta as linhas típicas de cada caso para não se começar de uma
 * folha em branco. O que fica guardado são os períodos, e o tipo é lido a partir
 * deles — um campo à parte mais tarde ou mais cedo dizia "fixa" num crédito com
 * um período variável lá dentro.
 *
 * **O valor do indexante pergunta-se, não se adivinha.** A app não tem fonte de
 * Euribor. Quem regista escreve o valor de hoje, e o plano diz que daí para a
 * frente é um cenário feito a esse valor. Deixar em branco não dá zero: dá um
 * plano que se recusa a existir e diz porquê.
 */

import { useState } from "react";
import {
  INDEXANTES,
  PERIODO_TIPO_LABELS,
  addMonths,
  capitalEmDividaEm,
  formatCents,
  tipoDoCredito,
  type CreditTerms,
  type Indexante,
  type IndexanteRates,
  type PeriodoTipo,
  type RatePeriod,
} from "@/lib/domain";
import { buscarEuriborAction } from "@/app/(app)/actions";

/** Uma linha na tabela, com os números ainda como texto. */
interface Linha {
  startsOn: string;
  kind: PeriodoTipo;
  ratePct: string;
  indexante: Indexante | "";
  spreadPct: string;
}

function plain(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}

/** "3,4" dá 3.4. `null` quando não é número — e um período sem taxa não conta. */
function numero(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * As linhas do ecrã como o domínio as quer.
 *
 * Deita fora as que ainda não estão preenchidas em vez de as completar com
 * zeros: uma taxa de 0% inventada dá um plano de amortização inteiro sem juros,
 * que é um número errado com ar de conta feita.
 */
function linhasParaPeriodos(linhas: Linha[]): RatePeriod[] {
  const out: RatePeriod[] = [];
  for (const l of linhas) {
    if (!l.startsOn) continue;
    if (l.kind === "fixa") {
      const taxa = numero(l.ratePct);
      if (taxa === null) continue;
      out.push({ startsOn: l.startsOn, kind: "fixa", ratePct: taxa, indexante: null, spreadPct: null });
      continue;
    }
    if (!l.indexante) continue;
    const spread = numero(l.spreadPct);
    if (spread === null) continue;
    out.push({
      startsOn: l.startsOn,
      kind: "variavel",
      ratePct: null,
      indexante: l.indexante,
      spreadPct: spread,
    });
  }
  return out;
}

/** Os valores dos indexantes escritos no ecrã, como o domínio os quer. */
function taxasParaRates(taxas: Record<string, string>): IndexanteRates {
  const r: IndexanteRates = {};
  for (const [k, v] of Object.entries(taxas)) {
    const n = numero(v);
    if (n !== null) r[k as Indexante] = n;
  }
  return r;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function linhasDe(terms: CreditTerms | null | undefined): Linha[] {
  if (!terms || terms.periods.length === 0) return [];
  return terms.periods.map((p) => ({
    startsOn: p.startsOn,
    kind: p.kind,
    ratePct: plain(p.ratePct),
    indexante: (p.indexante ?? "") as Indexante | "",
    spreadPct: plain(p.spreadPct),
  }));
}

const TIPOS_CREDITO = [
  { v: "fixa", label: "Fixa" },
  { v: "mista", label: "Mista" },
  { v: "variavel", label: "Variável" },
] as const;

/** As linhas que cada tipo de crédito costuma ter, para não se partir do vazio. */
function esqueleto(tipo: "fixa" | "mista" | "variavel", inicio: string): Linha[] {
  const fixa: Linha = { startsOn: inicio, kind: "fixa", ratePct: "", indexante: "", spreadPct: "" };
  const variavel: Linha = {
    startsOn: inicio,
    kind: "variavel",
    ratePct: "",
    indexante: "euribor6m",
    spreadPct: "",
  };
  if (tipo === "fixa") return [fixa];
  if (tipo === "variavel") return [variavel];
  // Mista: o período fixo do princípio (dois a cinco anos é o comum) e a
  // variável a seguir. As datas são um ponto de partida, não uma afirmação.
  return [fixa, { ...variavel, startsOn: addMonths(inicio, 36) }];
}

export function CreditPeriodsField({
  uid,
  maturityDate,
  terms,
  /**
   * Alguém escolheu "taxa mista" no campo de cima.
   *
   * Abre já aberto e com as linhas típicas — fixa no princípio, variável a
   * partir de uma data. Escolher "mista" lá em cima e não acontecer nada aqui
   * era prometer uma coisa e não a cumprir.
   */
  abrirComoMista = false,
  /** O montante do contrato, para se poder calcular o que falta pagar. */
  contratadoCents = null,
  /** O dia da escritura. */
  contractStart = "",
  /** Escreve o capital em dívida no campo lá de cima. */
  aoCalcular,
}: {
  uid: string;
  maturityDate?: string | null;
  terms?: CreditTerms | null;
  abrirComoMista?: boolean;
  contratadoCents?: number | null;
  contractStart?: string;
  aoCalcular?: (cents: number) => void;
}) {
  const iniciais = linhasDe(terms);
  const [ativo, setAtivo] = useState(iniciais.length > 0 || abrirComoMista);
  const [linhas, setLinhas] = useState<Linha[]>(
    iniciais.length > 0 ? iniciais : abrirComoMista ? esqueleto("mista", hoje()) : [],
  );
  const [maturidade, setMaturidade] = useState(maturityDate ?? "");
  const [taxas, setTaxas] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    for (const k of Object.keys(INDEXANTES) as Indexante[]) {
      const v = terms?.indexanteRates?.[k];
      if (typeof v === "number") r[k] = plain(v);
    }
    return r;
  });

  function muda(i: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }

  const tipo = tipoDoCredito(linhas.map((l) => ({ startsOn: l.startsOn, kind: l.kind })));
  // Só se pergunta o valor dos indexantes que estão mesmo a ser usados.
  const usados = Array.from(
    new Set(linhas.filter((l) => l.kind === "variavel" && l.indexante).map((l) => l.indexante)),
  ) as Indexante[];

  if (!ativo) {
    return (
      <div className="mt-4 border-t border-hair2 pt-4">
        <button
          type="button"
          onClick={() => {
            setAtivo(true);
            if (linhas.length === 0) setLinhas(esqueleto("mista", hoje()));
          }}
          className="btn-ghost h-9 px-3 text-xs"
        >
          A taxa muda ao longo do crédito
        </button>
        <p className="mt-1.5 text-xs text-fg-faint">
          Para um crédito à habitação fixo nos primeiros anos e variável depois.
          Sem isto, a prestação acima vale até ao fim: o que num crédito misto
          deixa de ser verdade no dia em que o período fixo acaba.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-hair2 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="label mb-0.5">Períodos de taxa</p>
          <p className="text-xs text-fg-faint">
            {tipo ? `Com estes períodos, é um crédito de taxa ${tipo}.` : "Acrescenta o primeiro período."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAtivo(false);
            setLinhas([]);
          }}
          className="btn-ghost h-8 shrink-0 px-2.5 text-xs"
        >
          Remover
        </button>
      </div>

      {/* Atalho: monta as linhas típicas. Não é um campo — nada disto é gravado. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TIPOS_CREDITO.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setLinhas(esqueleto(t.v, linhas[0]?.startsOn || hoje()))}
            aria-pressed={tipo === t.v}
            className={`h-8 rounded-full border px-3 text-xs transition ${
              tipo === t.v
                ? "border-fg bg-fg text-bg"
                : "border-hair bg-transparent text-fg-muted hover:border-fg/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {linhas.map((l, i) => (
          <div key={i} className="rounded-xl border border-hair bg-panel2/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">
                {i === 0 ? "Desde o início" : `A partir de`}
              </span>
              <button
                type="button"
                onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}
                className="text-xs text-fg-faint hover:text-debt"
                aria-label={`Apagar o período ${i + 1}`}
              >
                Apagar
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`cp-start-${uid}-${i}`}>Começa em</label>
                <input
                  id={`cp-start-${uid}-${i}`}
                  name="periodStart"
                  type="date"
                  value={l.startsOn}
                  onChange={(e) => muda(i, { startsOn: e.target.value })}
                  className="input h-9 text-xs"
                />
              </div>
              <div>
                <label className="label" htmlFor={`cp-kind-${uid}-${i}`}>Tipo</label>
                <select
                  id={`cp-kind-${uid}-${i}`}
                  name="periodKind"
                  value={l.kind}
                  onChange={(e) => muda(i, { kind: e.target.value as PeriodoTipo })}
                  className="select h-9 text-xs"
                >
                  {(Object.keys(PERIODO_TIPO_LABELS) as PeriodoTipo[]).map((k) => (
                    <option key={k} value={k}>{PERIODO_TIPO_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/*
              Os campos dos dois tipos estão sempre no DOM, e o que não interessa
              vai desativado. É de propósito: os campos repetidos chegam à ação
              como listas paralelas, e um campo que desaparecesse desalinhava as
              linhas todas a partir dali. Um `disabled` não é submetido, mas aqui
              o valor é escrito à mão em vez de vir do DOM.
            */}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {l.kind === "fixa" ? (
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`cp-rate-${uid}-${i}`}>Taxa anual (%)</label>
                  <input
                    id={`cp-rate-${uid}-${i}`}
                    inputMode="decimal"
                    value={l.ratePct}
                    onChange={(e) => muda(i, { ratePct: e.target.value })}
                    placeholder="3,3"
                    className="input h-9 text-xs"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor={`cp-idx-${uid}-${i}`}>Indexante</label>
                    <select
                      id={`cp-idx-${uid}-${i}`}
                      value={l.indexante}
                      onChange={(e) => muda(i, { indexante: e.target.value as Indexante | "" })}
                      className="select h-9 text-xs"
                    >
                      <option value="">Escolher</option>
                      {(Object.keys(INDEXANTES) as Indexante[]).map((k) => (
                        <option key={k} value={k}>{INDEXANTES[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`cp-spread-${uid}-${i}`}>Spread (%)</label>
                    <input
                      id={`cp-spread-${uid}-${i}`}
                      inputMode="decimal"
                      value={l.spreadPct}
                      onChange={(e) => muda(i, { spreadPct: e.target.value })}
                      placeholder="0,9"
                      className="input h-9 text-xs"
                    />
                  </div>
                </>
              )}
            </div>

            {/* O que a ação lê mesmo. Assim as quatro listas têm sempre o mesmo
                comprimento, haja ou não campo visível para cada uma. */}
            <input type="hidden" name="periodRate" value={l.kind === "fixa" ? l.ratePct : ""} />
            <input type="hidden" name="periodIndexante" value={l.kind === "variavel" ? l.indexante : ""} />
            <input type="hidden" name="periodSpread" value={l.kind === "variavel" ? l.spreadPct : ""} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setLinhas((ls) => [
            ...ls,
            {
              startsOn: addMonths(ls[ls.length - 1]?.startsOn || hoje(), 36),
              kind: "variavel",
              ratePct: "",
              indexante: "euribor6m",
              spreadPct: "",
            },
          ])
        }
        className="btn-ghost mt-2 h-9 px-3 text-xs"
      >
        Acrescentar período
      </button>

      {usados.length > 0 ? (
        <div className="mt-4 rounded-xl border border-hair bg-panel2/40 p-3">
          <p className="label mb-1">Valor do indexante hoje</p>
          <p className="mb-2.5 text-xs text-fg-faint">
            A Euribor daqui a uns anos ninguém sabe. Com o valor de hoje sai um
            cenário, e o plano diz que é um cenário e a que valor foi feito. O
            botão vai buscar a média do mês ao Banco Central Europeu, que é a
            média que os contratos portugueses usam, e não o valor de um dia.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {usados.map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`cp-idxrate-${uid}-${k}`}>{INDEXANTES[k]} (%)</label>
                {/*
                  `flex-wrap` e `min-w-0`, e não é detalhe: a nota do BCE é um
                  irmão com `basis-full`, e numa linha que não quebra ela
                  disputava a largura com o campo até o esmagar num círculo — o
                  valor ficava lá dentro, invisível.
                */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id={`cp-idxrate-${uid}-${k}`}
                    name={`indexanteRate-${k}`}
                    inputMode="decimal"
                    value={taxas[k] ?? ""}
                    onChange={(e) => setTaxas((t) => ({ ...t, [k]: e.target.value }))}
                    placeholder="2,1"
                    className="input h-9 min-w-0 flex-1 text-xs"
                  />
                  <BuscarEuribor
                    indexante={k}
                    aoReceber={(pct) =>
                      setTaxas((t) => ({ ...t, [k]: String(pct).replace(".", ",") }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <label className="label" htmlFor={`cp-maturity-${uid}`}>Maturidade</label>
        <input
          id={`cp-maturity-${uid}`}
          name="maturityDate"
          type="date"
          value={maturidade}
          onChange={(e) => setMaturidade(e.target.value)}
          className="input"
        />
        <p className="mt-1 text-xs text-fg-faint">
          A data do último pagamento. É sobre os meses que faltam até aqui que a
          prestação é recalculada em cada mudança de taxa, que é o que faz o
          degrau na prestação, e sem ela não há plano nenhum.
        </p>
      </div>

      {aoCalcular ? (
        <CapitalPeloContrato
          contratadoCents={contratadoCents}
          contractStart={contractStart}
          maturityDate={maturidade}
          periods={linhasParaPeriodos(linhas)}
          indexanteRates={taxasParaRates(taxas)}
          aoCalcular={aoCalcular}
        />
      ) : null}
    </div>
  );
}

/**
 * O capital em dívida calculado a partir do contrato.
 *
 * **Sugere e não escreve sozinho.** O número entra no património líquido e no
 * plano de amortização; pô-lo lá nas costas de quem está a preencher seria
 * decidir por essa pessoa. Ela vê o valor, vê que é uma estimativa, e carrega
 * se quiser.
 *
 * **E diz o que não sabe.** A conta não sabe de amortizações antecipadas, de
 * meses de carência nem de comissões. O valor do banco, quando existe, ganha
 * sempre — e o ecrã tem de o dizer, senão uma simulação passa por extracto.
 */
function CapitalPeloContrato({
  contratadoCents,
  contractStart,
  maturityDate,
  periods,
  indexanteRates,
  aoCalcular,
}: {
  contratadoCents: number | null;
  contractStart: string;
  maturityDate: string;
  periods: RatePeriod[];
  indexanteRates: IndexanteRates;
  aoCalcular: (cents: number) => void;
}) {
  const hojeIso = hoje();
  const r =
    contratadoCents && contractStart && maturityDate && periods.length > 0
      ? capitalEmDividaEm({
          principalCents: contratadoCents,
          contractStart,
          maturityDate,
          periods,
          indexanteRates,
          atDate: hojeIso,
        })
      : null;

  if (!r) {
    return (
      <p className="mt-4 text-xs leading-snug text-fg-faint">
        Com o montante contratado, a data de início, a maturidade e a taxa, a app
        calcula aqui o que falta pagar hoje.
      </p>
    );
  }

  if ("erro" in r) {
    return (
      <p className="mt-4 text-xs leading-snug text-fg-faint">
        Ainda não dá para calcular o capital em dívida: {r.erro.toLowerCase()}
      </p>
    );
  }

  const { balanceCents, mesesPagos, jurosPagosCents, prestacaoCents } = r.ok;

  return (
    <div className="mt-4 rounded-xl border border-hair bg-panel2/40 p-3">
      <p className="label mb-1">Pelo contrato, faltariam</p>
      <p className="font-display text-2xl font-semibold tracking-tight tnum">
        {formatCents(balanceCents)}
      </p>
      <p className="mt-1 text-xs leading-snug text-fg-muted">
        Ao fim de {mesesPagos} {mesesPagos === 1 ? "prestação" : "prestações"}, com{" "}
        {formatCents(jurosPagosCents)} de juros já pagos. A prestação em vigor
        daria {formatCents(prestacaoCents)}.
      </p>
      <p className="mt-1.5 text-xs leading-snug text-fg-faint">
        É uma simulação: não sabe de amortizações antecipadas, carências nem
        comissões. Se tiveres o mapa de responsabilidades do banco, esse ganha.
      </p>
      <button
        type="button"
        onClick={() => aoCalcular(balanceCents)}
        className="btn-secondary mt-2 text-xs"
      >
        Usar em &ldquo;quanto falta pagar&rdquo;
      </button>
    </div>
  );
}

/**
 * Ir buscar a Euribor ao BCE e pô-la no campo ao lado.
 *
 * **Preenche o campo e não grava nada.** O valor do indexante entra num plano
 * que projeta prestações até 2055; escrevê-lo sozinho nas costas de quem está
 * a preencher o formulário seria decidir por essa pessoa. Ela vê o número, vê
 * de que mês ele é, e grava se quiser.
 *
 * **Diz sempre de quando é.** A média de um mês é publicada depois de ele
 * acabar, por isso o normal é o valor ser do mês passado — e uma média de há
 * três meses apresentada sem data lê-se como a de agora.
 */
function BuscarEuribor({
  indexante,
  aoReceber,
}: {
  indexante: Indexante;
  aoReceber: (pct: number) => void;
}) {
  const [estado, setEstado] = useState<{ nota?: string; erro?: string } | null>(null);
  const [aPedir, setAPedir] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={aPedir}
        onClick={async () => {
          setAPedir(true);
          setEstado(null);
          try {
            const fd = new FormData();
            fd.set("indexante", indexante);
            const r = await buscarEuriborAction({}, fd);
            if (r.error || r.pct === null || r.pct === undefined) {
              setEstado({ erro: r.error ?? "Não consegui obter a Euribor." });
              return;
            }
            aoReceber(r.pct);
            setEstado({ nota: r.nota ?? undefined });
          } catch {
            setEstado({ erro: "Não consegui obter a Euribor." });
          } finally {
            setAPedir(false);
          }
        }}
        className="btn-ghost h-9 shrink-0 px-2 text-xs"
      >
        {aPedir ? "A ir buscar…" : "BCE"}
      </button>
      {estado?.nota ? (
        <span className="basis-full text-[11px] leading-snug text-fg-faint">{estado.nota}</span>
      ) : null}
      {estado?.erro ? (
        <span role="alert" className="basis-full text-[11px] leading-snug text-debt">
          {estado.erro} O campo continua a poder ser escrito à mão.
        </span>
      ) : null}
    </>
  );
}
