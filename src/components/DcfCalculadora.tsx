"use client";

/**
 * A calculadora de DCF.
 *
 * **Calcula no browser, sem gravar nada.** É uma folha de rascunho: mexe-se num
 * pressuposto e o resultado muda à frente de quem mexe, que é a única forma de
 * perceber o quanto ele depende do que se assumiu. Uma ida ao servidor por
 * tecla mataria isso.
 *
 * **O resultado é um intervalo, e o intervalo vem primeiro.** O valor central
 * está lá, mais pequeno. Um DCF apresentado como um número único é uma mentira
 * de apresentação mesmo com a aritmética certa — ver o cabeçalho do
 * `domain/dcf.ts`.
 */

import { useMemo, useState } from "react";
import { calcularDcf, formatCents, intervaloDcf } from "@/lib/domain";
import { PreencherAtivoDoDcf } from "./PreencherAtivoDoDcf";

/** Em milhões, que é como estes números se leem num relatório. */
function milhoesParaCents(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1_000_000 * 100) : Number.NaN;
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function DcfCalculadora() {
  const [nome, setNome] = useState("");
  const [simbolo, setSimbolo] = useState("");
  const [fcf, setFcf] = useState("");
  const [crescimento, setCrescimento] = useState("5");
  const [perpetuo, setPerpetuo] = useState("2");
  const [desconto, setDesconto] = useState("9");
  const [anos, setAnos] = useState("10");
  const [dividaLiquida, setDividaLiquida] = useState("0");
  const [acoes, setAcoes] = useState("");
  const [preco, setPreco] = useState("");

  const resultado = useMemo(() => {
    if (!fcf.trim() || !acoes.trim()) return null;
    return calcularDcf({
      fcfCents: milhoesParaCents(fcf),
      crescimentoPct: numero(crescimento),
      crescimentoPerpetuoPct: numero(perpetuo),
      descontoPct: numero(desconto),
      anos: numero(anos),
      dividaLiquidaCents: milhoesParaCents(dividaLiquida || "0"),
      acoes: numero(acoes) * 1_000_000,
      precoAtualCents: preco.trim() ? Math.round(numero(preco) * 100) : null,
    });
  }, [fcf, crescimento, perpetuo, desconto, anos, dividaLiquida, acoes, preco]);

  const ok = resultado && "ok" in resultado ? resultado.ok : null;
  const intervalo = ok ? intervaloDcf(ok) : null;

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa" valor={nome} onChange={setNome} placeholder="Alphabet" />
          <Campo
            label="Símbolo (opcional)"
            valor={simbolo}
            onChange={setSimbolo}
            placeholder="googl.us"
            mono
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            label="Fluxo de caixa livre (milhões)"
            valor={fcf}
            onChange={setFcf}
            placeholder="72500"
            nota="O do último ano fechado. É a base de tudo o resto."
          />
          <Campo
            label="Ações em circulação (milhões)"
            valor={acoes}
            onChange={setAcoes}
            placeholder="12100"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Crescimento anual (%)" valor={crescimento} onChange={setCrescimento} />
          <Campo label="Crescimento perpétuo (%)" valor={perpetuo} onChange={setPerpetuo} />
          <Campo label="Taxa de desconto (%)" valor={desconto} onChange={setDesconto} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Anos de projeção" valor={anos} onChange={setAnos} />
          <Campo
            label="Dívida líquida (milhões)"
            valor={dividaLiquida}
            onChange={setDividaLiquida}
            nota="Dívida menos caixa. Negativo se houver mais caixa."
          />
          <Campo
            label="Preço atual por ação"
            valor={preco}
            onChange={setPreco}
            nota="Só para a margem de segurança."
          />
        </div>
      </section>

      {resultado && "erro" in resultado ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm leading-snug text-fg-muted">
          {resultado.erro}
        </p>
      ) : null}

      {ok && intervalo ? (
        <>
          <section className="card p-5">
            <p className="eyebrow mb-1">Vale entre</p>
            {/* O intervalo primeiro e maior. O ponto central é o menos
                importante dos três — ver o cabeçalho do módulo. */}
            <p className="font-display text-3xl font-semibold tracking-tight tnum">
              {formatCents(intervalo.minCents)} — {formatCents(intervalo.maxCents)}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              por ação, conforme o que se assumir. O ponto central destes
              pressupostos é{" "}
              <span className="font-mono text-fg">{formatCents(ok.valorPorAcaoCents)}</span>.
            </p>

            {ok.margemDeSegurancaPct !== null ? (
              <p className="mt-3 text-sm">
                Margem de segurança:{" "}
                <span
                  className={`font-mono tnum ${ok.margemDeSegurancaPct >= 0 ? "text-credit" : "text-debt"}`}
                >
                  {ok.margemDeSegurancaPct >= 0 ? "+" : ""}
                  {ok.margemDeSegurancaPct}%
                </span>{" "}
                <span className="text-fg-faint">face ao preço que escreveste.</span>
              </p>
            ) : null}

            {/*
              A fatia que vem do infinito. Acima de três quartos, o cálculo está
              a dizer sobretudo o que se assumiu para depois do horizonte — e
              quem lê tem de saber, senão atribui a projeção ao trabalho de
              projetar os anos que se projetaram.
            */}
            <p className="mt-3 text-xs leading-snug text-fg-faint">
              {ok.pesoDoTerminalPct}% do valor vem do valor terminal — do que
              acontece <strong className="font-medium text-fg-muted">depois</strong> dos{" "}
              {ok.anos.length} anos projetados.
              {ok.pesoDoTerminalPct >= 75
                ? " Acima de três quartos, este cálculo está a falar sobretudo do crescimento perpétuo que assumiste, e quase nada dos anos que projetaste."
                : ""}
            </p>
          </section>

          <section className="card p-5">
            <p className="eyebrow mb-2">Se os pressupostos fossem outros</p>
            <ul className="space-y-1.5 text-sm">
              {ok.sensibilidade.map((s) => (
                <li key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-fg-muted">{s.label}</span>
                  <span className="font-mono tnum text-fg">
                    {formatCents(s.valorPorAcaoCents)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-snug text-fg-faint">
              Um ponto percentual na taxa de desconto é uma diferença de opinião
              banal entre dois analistas. Repara no que faz ao valor.
            </p>
          </section>

          {/*
            Passar do estudo ao registo sem reescrever tudo. Não compra nada nem
            inventa quantidade nenhuma: abre o formulário do bem já preenchido.
          */}
          <PreencherAtivoDoDcf
            nome={nome}
            simbolo={simbolo}
            precoCents={preco.trim() ? Math.round(numero(preco) * 100) : null}
          />
        </>
      ) : null}
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  nota,
  mono,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  nota?: string;
  mono?: boolean;
}) {
  const id = `dcf-${label.replace(/[^a-z]/gi, "").toLowerCase()}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={valor}
        inputMode={mono ? undefined : "decimal"}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${mono ? "font-mono" : ""}`}
      />
      {nota ? <p className="mt-1 text-xs text-fg-faint">{nota}</p> : null}
    </div>
  );
}
