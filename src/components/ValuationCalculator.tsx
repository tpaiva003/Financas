"use client";

import { useState } from "react";
import {
  computeValuation,
  DEFAULT_PARAMS,
  DEFAULT_PROBABILITIES,
  DEFAULT_SCENARIOS,
  type CompanyInputs,
  type Probabilities,
  type ScenarioKey,
  type Scenarios,
  type ValuationParams,
} from "@/lib/domain/valuation";
import type { CompanyFinancials } from "@/lib/market/types";

function parseNum(v: string): number | null {
  const clean = v.replace(/\s/g, "").replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-PT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return `${n > 0 ? "+" : ""}${fmt(n, digits)}%`;
}

const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

export function ValuationCalculator() {
  // Identificação
  const [company, setCompany] = useState("");
  const [symbol, setSymbol] = useState("");

  // Dados da empresa (preenchidos pela recolha ou à mão)
  const [fcf, setFcf] = useState("");
  const [shares, setShares] = useState("");
  const [netDebt, setNetDebt] = useState("");
  const [price, setPrice] = useState("");

  // Pressupostos
  const [params, setParams] = useState<ValuationParams>(DEFAULT_PARAMS);
  const [scenarios, setScenarios] = useState<Scenarios>(DEFAULT_SCENARIOS);
  const [probs, setProbs] = useState<Probabilities>(DEFAULT_PROBABILITIES);
  const [notes, setNotes] = useState("");

  // Recolha
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyFinancials | null>(null);

  async function handleFetch() {
    const s = symbol.trim();
    if (s === "") {
      setFetchError("Escreve o símbolo da empresa primeiro (ex.: GOOGL, AAPL, MC.PA).");
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/market/${encodeURIComponent(s)}`);
      const body = await res.json();
      if (!res.ok) {
        setFetchError(body.error ?? "Não foi possível obter os dados.");
        setData(null);
        return;
      }
      const d = body as CompanyFinancials;
      setData(d);
      // Só preenche o que a fonte deu — o resto fica como está, para escreveres
      if (d.name) setCompany(d.name);
      if (d.freeCashFlow !== null) setFcf(String(Math.round(d.freeCashFlow)));
      if (d.sharesOutstanding !== null) setShares(String(Math.round(d.sharesOutstanding)));
      if (d.netDebt !== null) setNetDebt(String(Math.round(d.netDebt)));
      if (d.currentPrice !== null) setPrice(String(d.currentPrice));
    } catch {
      setFetchError("A ligação falhou. Verifica a rede e tenta outra vez.");
    } finally {
      setFetching(false);
    }
  }

  const inputs: CompanyInputs = {
    freeCashFlow: parseNum(fcf) ?? 0,
    sharesOutstanding: parseNum(shares) ?? 0,
    netDebt: parseNum(netDebt) ?? 0,
    currentPrice: parseNum(price),
  };

  const ready = inputs.freeCashFlow > 0 && inputs.sharesOutstanding > 0;
  const result = computeValuation(inputs, scenarios, probs, params);

  return (
    <div className="space-y-6">
      {/* ---------- Recolha automática ---------- */}
      <section className="card space-y-4 p-6">
        <div>
          <h2 className="label">Empresa</h2>
          <p className="text-sm text-fg-muted">
            Escreve o símbolo e carrega em Obter dados: o resto preenche-se
            sozinho. Podes corrigir qualquer campo à mão.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="v-company">Nome</label>
            <input
              id="v-company"
              className="input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Alphabet"
            />
          </div>
          <div>
            <label className="label" htmlFor="v-symbol">Símbolo</label>
            <div className="flex gap-2">
              <input
                id="v-symbol"
                className="input font-mono uppercase"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleFetch();
                  }
                }}
                placeholder="GOOGL"
              />
              <button
                type="button"
                onClick={() => void handleFetch()}
                disabled={fetching}
                className="btn-primary shrink-0"
              >
                {fetching ? "A obter…" : "Obter dados"}
              </button>
            </div>
          </div>
        </div>

        {fetchError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {fetchError}
          </p>
        ) : null}

        {data ? (
          <div className="space-y-2 text-sm">
            <p className="text-fg-muted">
              {data.name ?? data.symbol}
              {data.sector ? ` · ${data.sector}` : ""}
              {data.currency ? ` · ${data.currency}` : ""} · fonte: {data.source}
            </p>
            {data.missing.length > 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                A fonte não trouxe: {data.missing.join(", ")}. Preenche à mão: ficaram
                por preencher em vez de serem inventados.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---------- Dados da empresa ---------- */}
      <section className="card space-y-4 p-6">
        <h2 className="label">Números base</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            id="v-fcf"
            label="Fluxo de caixa livre (M)"
            value={fcf}
            onChange={setFcf}
            hint="Do último ano fechado. É a base de tudo."
          />
          <Field
            id="v-shares"
            label="Ações em circulação (M)"
            value={shares}
            onChange={setShares}
          />
          <Field
            id="v-netdebt"
            label="Dívida líquida (M)"
            value={netDebt}
            onChange={setNetDebt}
            hint="Dívida menos caixa. Negativa se houver mais caixa."
          />
          <Field
            id="v-price"
            label="Preço atual por ação"
            value={price}
            onChange={setPrice}
            hint="Só para a margem de segurança."
          />
        </div>
      </section>

      {/* ---------- Pressupostos ---------- */}
      <section className="card space-y-4 p-6">
        <h2 className="label">Pressupostos</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumField
            id="v-wacc"
            label="Taxa de desconto (%)"
            value={params.discountRate}
            onChange={(v) => setParams({ ...params, discountRate: v })}
          />
          <NumField
            id="v-terminal"
            label="Crescimento perpétuo (%)"
            value={params.terminalGrowth}
            onChange={(v) => setParams({ ...params, terminalGrowth: v })}
          />
          <NumField
            id="v-mos"
            label="Margem de segurança (%)"
            value={params.marginOfSafety}
            onChange={(v) => setParams({ ...params, marginOfSafety: v })}
          />
        </div>

        <div className="scroll-x">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-fg-faint">
                <th className="py-2 font-normal">Crescimento do FCF</th>
                <th className="py-2 font-normal">Baixo</th>
                <th className="py-2 font-normal">Médio</th>
                <th className="py-2 font-normal">Alto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 text-fg-muted">Anos 1-5 (%)</td>
                {(["low", "medium", "high"] as ScenarioKey[]).map((k) => (
                  <td key={k} className="py-1 pr-2">
                    <input
                      aria-label={`Crescimento anos 1-5, cenário ${SCENARIO_LABEL[k]}`}
                      className="input py-1"
                      inputMode="decimal"
                      value={scenarios[k].years1to5}
                      onChange={(e) =>
                        setScenarios({
                          ...scenarios,
                          [k]: { ...scenarios[k], years1to5: parseNum(e.target.value) ?? 0 },
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 text-fg-muted">Anos 6-10 (%)</td>
                {(["low", "medium", "high"] as ScenarioKey[]).map((k) => (
                  <td key={k} className="py-1 pr-2">
                    <input
                      aria-label={`Crescimento anos 6-10, cenário ${SCENARIO_LABEL[k]}`}
                      className="input py-1"
                      inputMode="decimal"
                      value={scenarios[k].years6to10}
                      onChange={(e) =>
                        setScenarios({
                          ...scenarios,
                          [k]: { ...scenarios[k], years6to10: parseNum(e.target.value) ?? 0 },
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 text-fg-muted">Probabilidade (%)</td>
                {(["low", "medium", "high"] as ScenarioKey[]).map((k) => (
                  <td key={k} className="py-1 pr-2">
                    <input
                      aria-label={`Probabilidade do cenário ${SCENARIO_LABEL[k]}`}
                      className="input py-1"
                      inputMode="decimal"
                      value={probs[k]}
                      onChange={(e) =>
                        setProbs({ ...probs, [k]: parseNum(e.target.value) ?? 0 })
                      }
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {data?.analystRevenueGrowth !== null && data?.analystRevenueGrowth !== undefined ? (
          <p className="text-sm text-fg-muted">
            Analistas estimam {fmtPct(data.analystRevenueGrowth)} de crescimento de receita
            para o próximo ano
            {data.analystEarningsGrowth !== null
              ? ` e ${fmtPct(data.analystEarningsGrowth)} de lucros`
              : ""}
            . Compara com os teus números acima.
          </p>
        ) : null}
      </section>

      {/* ---------- Resultados ---------- */}
      {result.warnings.length > 0 ? (
        <div className="card space-y-1 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {ready ? (
        <section className="card space-y-4 p-6">
          <h2 className="label">Resultado</h2>
          <div className="scroll-x">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-fg-faint">
                  <th className="py-2 font-normal">&nbsp;</th>
                  <th className="py-2 text-right font-normal">Baixo</th>
                  <th className="py-2 text-right font-normal">Médio</th>
                  <th className="py-2 text-right font-normal">Alto</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Valor intrínseco / ação"
                  values={[
                    result.low.intrinsicValue,
                    result.medium.intrinsicValue,
                    result.high.intrinsicValue,
                  ]}
                />
                <Row
                  label={`Com margem de ${fmt(params.marginOfSafety, 0)}%`}
                  values={[
                    result.low.priceWithMargin,
                    result.medium.priceWithMargin,
                    result.high.priceWithMargin,
                  ]}
                  strong
                />
                {inputs.currentPrice !== null ? (
                  <tr className="border-t border-line">
                    <td className="py-2 text-fg-muted">Face ao preço atual</td>
                    {[result.low, result.medium, result.high].map((s, i) => (
                      <td
                        key={i}
                        className={`py-2 text-right tabular-nums ${
                          (s.upsidePct ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {fmtPct(s.upsidePct)}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-line bg-bg-subtle p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="label">Preço ponderado</p>
                <p className="text-2xl tabular-nums">{fmt(result.weightedPrice)}</p>
              </div>
              {result.attractive !== null ? (
                <p
                  className={`text-sm ${
                    result.attractive ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {result.attractive ? "Abaixo do teu preço de compra" : "Acima do teu preço de compra"}
                  {" · "}
                  {fmtPct(result.weightedUpsidePct)} face aos {fmt(inputs.currentPrice)} atuais
                </p>
              ) : (
                <p className="text-sm text-fg-muted">
                  Sem preço atual não há veredicto: escreve-o acima.
                </p>
              )}
            </div>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-fg-muted">
              Ver os fluxos de caixa ano a ano
            </summary>
            <div className="mt-3 grid gap-6 lg:grid-cols-3">
              {(["low", "medium", "high"] as ScenarioKey[]).map((k) => (
                <div key={k}>
                  <p className="label mb-2">{SCENARIO_LABEL[k]}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-fg-faint">
                        <th className="py-1 font-normal">Ano</th>
                        <th className="py-1 text-right font-normal">FCF</th>
                        <th className="py-1 text-right font-normal">Valor atual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result[k].years.map((y) => (
                        <tr key={y.year}>
                          <td className="py-0.5 text-fg-muted">{y.year}</td>
                          <td className="py-0.5 text-right tabular-nums">{fmt(y.cashFlow)}</td>
                          <td className="py-0.5 text-right tabular-nums">
                            {fmt(y.presentValue)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-line">
                        <td className="py-1 text-fg-muted">Terminal</td>
                        <td className="py-1 text-right tabular-nums">
                          {fmt(result[k].terminalValue)}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {fmt(result[k].terminalValuePresent)}
                        </td>
                      </tr>
                      <tr className="border-t border-line font-medium">
                        <td className="py-1">Valor da empresa</td>
                        <td className="py-1" />
                        <td className="py-1 text-right tabular-nums">
                          {fmt(result[k].enterpriseValue)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : (
        <p className="text-sm text-fg-muted">
          Preenche o fluxo de caixa livre e as ações em circulação para ver o resultado.
        </p>
      )}

      {/* ---------- Histórico ---------- */}
      {data && data.history.length > 0 ? (
        <section className="card space-y-4 p-6">
          <div>
            <h2 className="label">Histórico</h2>
            <p className="text-sm text-fg-muted">
              O passado não garante o futuro, mas uma trajetória de fluxos de caixa e
              de retorno sobre o capital diz mais do que o retrato de um ano.
            </p>
          </div>
          <div className="scroll-x">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-fg-faint">
                  <th className="py-2 font-normal">Ano</th>
                  <th className="py-2 text-right font-normal">Receita</th>
                  <th className="py-2 text-right font-normal">FCF</th>
                  <th className="py-2 text-right font-normal">Margem FCF</th>
                  <th className="py-2 text-right font-normal">Margem líquida</th>
                  <th className="py-2 text-right font-normal">ROCE</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.year} className="border-t border-line">
                    <td className="py-2 text-fg-muted">{h.year}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(h.revenue, 0)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(h.freeCashFlow, 0)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(h.fcfMargin, 1)}%</td>
                    <td className="py-2 text-right tabular-nums">{fmt(h.netMargin, 1)}%</td>
                    <td className="py-2 text-right tabular-nums">{fmt(h.roce, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Margem bruta" value={data.metrics.grossMargin} suffix="%" />
            <Metric label="Margem operacional" value={data.metrics.operatingMargin} suffix="%" />
            <Metric label="ROE" value={data.metrics.roe} suffix="%" />
            <Metric label="Dívida / capital" value={data.metrics.debtToEquity} suffix="%" />
          </div>
        </section>
      ) : null}

      {/* ---------- Notas ---------- */}
      <section className="card space-y-3 p-6">
        <label className="label" htmlFor="v-notes">Notas</label>
        <textarea
          id="v-notes"
          className="input min-h-24"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="O que te fez escolher estes pressupostos, o que rever na próxima apresentação de resultados…"
        />
        <p className="text-xs text-fg-faint">
          As notas ficam só neste ecrã: sair da página apaga-as.
        </p>
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1 text-xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(parseNum(e.target.value) ?? 0)}
      />
    </div>
  );
}

function Row({
  label,
  values,
  strong,
}: {
  label: string;
  values: number[];
  strong?: boolean;
}) {
  return (
    <tr className="border-t border-line">
      <td className={`py-2 ${strong ? "" : "text-fg-muted"}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-2 text-right tabular-nums ${strong ? "font-medium" : ""}`}>
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs text-fg-faint">{label}</p>
      <p className="tabular-nums">
        {fmt(value, 1)}
        {value !== null ? (suffix ?? "") : ""}
      </p>
    </div>
  );
}
