"use client";

/**
 * A calculadora de avaliação: três cenários, probabilidades e um veredicto.
 *
 * **Calcula no browser e não grava nada.** É uma folha de rascunho: mexe-se num
 * pressuposto e tudo muda à frente de quem mexe, que é a única forma de
 * perceber o quanto o resultado depende do que se assumiu. Uma ida ao servidor
 * por tecla mataria isso.
 *
 * **A ordem do ecrã é a ordem da decisão**, e é a mesma da folha de cálculo que
 * isto substitui: os dados da empresa, os parâmetros, os três futuros com o
 * peso que se lhes dá, e só no fim o veredicto. Pôr o veredicto em cima fazia
 * dele a conclusão de que se anda à procura, em vez do resultado do que se
 * escreveu.
 */

import { useMemo, useState } from "react";
import {
  CENARIOS_POR_OMISSAO,
  avaliarCenarios,
  cenariosDoHistorico,
  formatCents,
  moedasBatem,
  type CenarioDcf,
  type CenarioId,
  type Fundamentais,
} from "@/lib/domain";
import { PreencherAtivoDoDcf } from "./PreencherAtivoDoDcf";
import { BuscarFundamentais } from "./BuscarFundamentais";

/** Em milhares de milhões, que é como estes números vêm num relatório. */
function bilioesParaCents(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1_000_000_000 * 100) : Number.NaN;
}

function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function DcfCalculadora() {
  const [nome, setNome] = useState("");
  const [simbolo, setSimbolo] = useState("");

  // Dados da empresa, em milhares de milhões.
  const [fcf, setFcf] = useState("");
  const [acoes, setAcoes] = useState("");
  const [divida, setDivida] = useState("");
  const [caixa, setCaixa] = useState("");
  const [preco, setPreco] = useState("");

  // Parâmetros.
  const [margem, setMargem] = useState("30");
  const [desconto, setDesconto] = useState("8,5");
  const [perpetuo, setPerpetuo] = useState("2");
  const [anos, setAnos] = useState("10");

  const [cenarios, setCenarios] = useState<CenarioDcf[]>(CENARIOS_POR_OMISSAO);
  const [notas, setNotas] = useState("");

  /** As contas que a fonte trouxe, para o historial e os avisos. */
  const [contas, setContas] = useState<Fundamentais | null>(null);
  const [cenariosDaFonte, setCenariosDaFonte] = useState(false);

  const mexer = (id: CenarioId, campo: keyof CenarioDcf, valor: string) =>
    setCenarios((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: num(valor) } : c)));

  /**
   * A dívida líquida é derivada, e não escrita.
   *
   * Escrevê-la à mão ao lado da dívida e da caixa dava três campos em que dois
   * mandam no terceiro — e mais cedo ou mais tarde deixavam de bater certo.
   */
  const dividaLiquidaCents = useMemo(() => {
    const d = divida.trim() ? bilioesParaCents(divida) : 0;
    const c = caixa.trim() ? bilioesParaCents(caixa) : 0;
    return (Number.isFinite(d) ? d : 0) - (Number.isFinite(c) ? c : 0);
  }, [divida, caixa]);

  const avaliacao = useMemo(() => {
    if (!fcf.trim() || !acoes.trim()) return null;
    return avaliarCenarios({
      base: {
        fcfCents: bilioesParaCents(fcf),
        crescimentoPerpetuoPct: num(perpetuo),
        descontoPct: num(desconto),
        anos: num(anos),
        anosPrimeiraFase: Math.ceil(num(anos) / 2),
        dividaLiquidaCents,
        acoes: num(acoes) * 1_000_000_000,
        precoAtualCents: preco.trim() ? Math.round(num(preco) * 100) : null,
      },
      cenarios,
      margemPct: num(margem),
    });
  }, [fcf, acoes, perpetuo, desconto, anos, dividaLiquidaCents, preco, cenarios, margem]);

  const ok = avaliacao && "ok" in avaliacao ? avaliacao.ok : null;
  const somaProb = cenarios.reduce((s, c) => s + (Number.isFinite(c.probabilidadePct) ? c.probabilidadePct : 0), 0);

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="eyebrow">Dados da empresa</p>
          <BuscarFundamentais
            simbolo={simbolo}
            aoReceber={(d) => {
              setContas(d);
              if (d.nome) setNome(d.nome);
              if (d.fcfBilioes !== null) setFcf(String(d.fcfBilioes).replace(".", ","));
              if (d.acoesBilioes !== null) setAcoes(String(d.acoesBilioes).replace(".", ","));
              if (d.dividaBilioes !== null) setDivida(String(d.dividaBilioes).replace(".", ","));
              if (d.caixaBilioes !== null) setCaixa(String(d.caixaBilioes).replace(".", ","));
              if (d.precoUnidade !== null) setPreco(String(d.precoUnidade).replace(".", ","));

              // Os cenários partem do que a empresa fez, e não de três números
              // que a app escolheu. Continuam todos editáveis e o ecrã diz de
              // onde vieram — um pressuposto sem origem visível é uma opinião
              // da app com ar de conta.
              const sugeridos = cenariosDoHistorico(d.medias);
              if (sugeridos) {
                setCenarios((cs) =>
                  cs.map((c) => {
                    const [primeira, segunda] = sugeridos[c.id];
                    return { ...c, crescimentoPct: primeira, crescimentoTardioPct: segunda };
                  }),
                );
                setCenariosDaFonte(true);
              }
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa" valor={nome} onChange={setNome} placeholder="Alphabet" />
          <Campo label="Símbolo" valor={simbolo} onChange={setSimbolo} placeholder="googl.us" mono />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Fluxo de caixa livre (mM)" valor={fcf} onChange={setFcf} placeholder="5,564" />
          <Campo label="Ações em circulação (mM)" valor={acoes} onChange={setAcoes} placeholder="0,283" />
          <Campo label="Preço por ação" valor={preco} onChange={setPreco} placeholder="409,75" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Dívida de longo prazo (mM)" valor={divida} onChange={setDivida} placeholder="9,987" />
          <Campo label="Caixa e equivalentes (mM)" valor={caixa} onChange={setCaixa} placeholder="10,422" />
          <div>
            <p className="label">Dívida líquida (mM)</p>
            <p className="input flex items-center font-mono text-sm text-fg-muted">
              {divida.trim() || caixa.trim()
                ? (dividaLiquidaCents / 100 / 1_000_000_000).toFixed(3).replace(".", ",")
                : "—"}
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              Calculada, não escrita: dívida menos caixa.
            </p>
          </div>
        </div>

        {contas && !moedasBatem(contas) ? (
          <p
            role="alert"
            className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-xs leading-snug text-fg-muted"
          >
            Esta empresa relata as contas em{" "}
            <strong className="font-medium text-fg">{contas.moedaRelato}</strong> e cota em{" "}
            <strong className="font-medium text-fg">{contas.moedaCotacao}</strong>. O valor por
            ação vai sair na moeda das contas e o preço está na da bolsa — a conta corre sem
            erro nenhum e o veredicto fica errado pela diferença cambial. Converte um dos dois
            antes de decidir.
          </p>
        ) : null}
      </section>

      <section className="card space-y-4 p-5">
        <p className="eyebrow">Parâmetros</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Margem de segurança (%)" valor={margem} onChange={setMargem} />
          <Campo label="Taxa de desconto (%)" valor={desconto} onChange={setDesconto} />
          <Campo label="Crescimento perpétuo (%)" valor={perpetuo} onChange={setPerpetuo} />
          <Campo label="Anos de projeção" valor={anos} onChange={setAnos} />
        </div>
        <p className="text-xs leading-snug text-fg-faint">
          A margem de segurança desconta-se ao valor <strong className="font-medium text-fg-muted">antes</strong> de
          o comparar com o preço. É a diferença entre &ldquo;vale 492 e custa 410,
          está barata&rdquo; e &ldquo;só compro abaixo de 344, e custa 410, logo não&rdquo;.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <p className="eyebrow">Os três futuros</p>
        <p className="text-xs leading-snug text-fg-faint">
          Duas fases porque uma empresa que cresce 15% não cresce 15% durante dez
          anos: a concorrência chega e a base fica grande. Projetar a taxa dos
          primeiros anos até ao fim inflaciona o valor terminal, que já é a maior
          parte do resultado.
        </p>

        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th className="pb-2 font-normal">Cenário</th>
                <th className="pb-2 font-normal">Anos 1-{Math.ceil(num(anos) / 2) || 5}</th>
                <th className="pb-2 font-normal">Seguintes</th>
                <th className="pb-2 font-normal">Probabilidade</th>
              </tr>
            </thead>
            <tbody>
              {cenarios.map((c) => (
                <tr key={c.id}>
                  <td className="py-1 pr-3 text-fg">{LABEL[c.id]}</td>
                  <td className="py-1 pr-2">
                    <CampoTabela valor={c.crescimentoPct} onChange={(v) => mexer(c.id, "crescimentoPct", v)} />
                  </td>
                  <td className="py-1 pr-2">
                    <CampoTabela
                      valor={c.crescimentoTardioPct}
                      onChange={(v) => mexer(c.id, "crescimentoTardioPct", v)}
                    />
                  </td>
                  <td className="py-1">
                    <CampoTabela
                      valor={c.probabilidadePct}
                      onChange={(v) => mexer(c.id, "probabilidadePct", v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={`text-xs ${Math.abs(somaProb - 100) > 0.5 ? "text-debt" : "text-fg-faint"}`}>
          As probabilidades somam {Math.round(somaProb * 10) / 10}%
          {Math.abs(somaProb - 100) > 0.5 ? " e têm de somar 100%." : "."}
        </p>

        {cenariosDaFonte && contas ? (
          <p className="text-xs leading-snug text-fg-faint">
            Estas taxas partem do historial:{" "}
            {contas.medias.crescimentoFcfPct !== null ? (
              <>
                o fluxo livre cresceu{" "}
                <span className="text-fg-muted">
                  {String(contas.medias.crescimentoFcfPct).replace(".", ",")}% ao ano
                </span>{" "}
                nos últimos {contas.medias.anos} exercícios
              </>
            ) : (
              <>
                a receita cresceu{" "}
                <span className="text-fg-muted">
                  {String(contas.medias.crescimentoReceitaPct).replace(".", ",")}% ao ano
                </span>
              </>
            )}
            . O passado não é o futuro — muda-as se souberes melhor.
            {contas.estimativas.crescimento5aPct !== null ? (
              <>
                {" "}
                Os analistas apontam{" "}
                <span className="text-fg-muted">
                  {String(contas.estimativas.crescimento5aPct).replace(".", ",")}% a cinco anos
                </span>
                .
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {contas && contas.historico.length > 0 ? <Historial contas={contas} /> : null}

      {avaliacao && "erro" in avaliacao ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm leading-snug text-fg-muted">
          {avaliacao.erro}
        </p>
      ) : null}

      {ok ? (
        <>
          <section className="card p-5">
            <p className="eyebrow mb-3">Resultado</p>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="text-right text-xs text-fg-muted">
                    <th className="pb-2 text-left font-normal" />
                    {ok.cenarios.map((c) => (
                      <th key={c.id} className="pb-2 font-normal">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono tnum">
                  <Linha titulo="Valor intrínseco" valores={ok.cenarios.map((c) => formatCents(c.valorPorAcaoCents))} />
                  <Linha
                    titulo={`Com margem de ${ok.margemPct}%`}
                    valores={ok.cenarios.map((c) => formatCents(c.comMargemCents))}
                    destaque
                  />
                  <Linha
                    titulo="Face ao preço"
                    valores={ok.cenarios.map((c) => (c.upsidePct === null ? "—" : `${c.upsidePct > 0 ? "+" : ""}${c.upsidePct}%`))}
                    cores={ok.cenarios.map((c) => (c.upsidePct === null ? null : c.upsidePct >= 0))}
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <p className="eyebrow mb-1">Preço ponderado</p>
            <p className="font-display text-3xl font-semibold tracking-tight tnum">
              {formatCents(ok.precoPonderadoCents)}
            </p>
            {ok.upsidePonderadoPct !== null ? (
              <p className="mt-1 text-sm">
                <span className={ok.upsidePonderadoPct >= 0 ? "text-credit" : "text-debt"}>
                  {ok.upsidePonderadoPct > 0 ? "+" : ""}
                  {ok.upsidePonderadoPct}%
                </span>{" "}
                <span className="text-fg-muted">
                  face aos {formatCents(Math.round(num(preco) * 100))} de mercado.
                </span>
              </p>
            ) : null}

            {ok.atrativo !== null ? (
              <p
                className={`mt-3 inline-block rounded-full border px-3 py-1 text-sm ${
                  ok.atrativo ? "border-credit/40 text-credit" : "border-debt/40 text-debt"
                }`}
              >
                {ok.atrativo ? "Atrativa aos pressupostos que escreveste" : "Não atrativa aos pressupostos que escreveste"}
              </p>
            ) : (
              <p className="mt-3 text-xs text-fg-faint">
                Sem preço de mercado não há veredicto: não há nada com que
                comparar, e um veredicto sem termo de comparação é uma opinião
                com ar de conta.
              </p>
            )}
          </section>

          {/* O quadro ano a ano do cenário central: é o que se confere. */}
          {ok.cenarios
            .filter((c) => c.id === "medio")
            .map((c) => (
              <section key={c.id} className="card p-5">
                <p className="eyebrow mb-3">Fluxos do cenário central</p>
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[22rem] text-sm">
                    <thead>
                      <tr className="text-right text-xs text-fg-muted">
                        <th className="pb-2 text-left font-normal">Ano</th>
                        <th className="pb-2 font-normal">Crescimento</th>
                        <th className="pb-2 font-normal">Fluxo</th>
                        <th className="pb-2 font-normal">A valor de hoje</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tnum text-fg-muted">
                      {c.resultado.anos.map((a) => (
                        <tr key={a.ano}>
                          <td className="py-0.5 text-left">{a.ano}</td>
                          <td className="py-0.5 text-right">{String(a.crescimentoPct).replace(".", ",")}%</td>
                          <td className="py-0.5 text-right">{formatCents(a.fcfCents)}</td>
                          <td className="py-0.5 text-right text-fg">{formatCents(a.presenteCents)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-hair2">
                        <td className="py-1 text-left" colSpan={3}>
                          Valor terminal
                        </td>
                        <td className="py-1 text-right text-fg">{formatCents(c.resultado.terminalCents)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs leading-snug text-fg-faint">
                  {c.resultado.pesoDoTerminalPct}% do valor vem do valor terminal —
                  do que acontece <strong className="font-medium text-fg-muted">depois</strong> destes
                  anos.
                  {c.resultado.pesoDoTerminalPct >= 75
                    ? " Acima de três quartos, este cálculo está a falar sobretudo do crescimento perpétuo que assumiste."
                    : ""}
                </p>
              </section>
            ))}

          <section className="card p-5">
            <label className="label" htmlFor="dcf-notas">
              Notas
            </label>
            <textarea
              id="dcf-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="O que te levou a estes pressupostos, e o que rever na próxima apresentação de resultados."
              className="input min-h-[4.5rem] resize-y"
            />
            <p className="mt-1 text-xs text-fg-faint">
              Ainda não ficam guardadas — é uma folha de rascunho. Copia-as para
              a nota do investimento se quiseres mantê-las.
            </p>
          </section>

          <PreencherAtivoDoDcf
            nome={nome}
            simbolo={simbolo}
            precoCents={preco.trim() ? Math.round(num(preco) * 100) : null}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * O historial, que é o que separa uma avaliação de um palpite com aritmética.
 *
 * **Existe para se olhar para a coluna, não para a célula.** Uma margem
 * operacional de 32% não diz nada; 22 → 26 → 32 diz que a empresa está a ganhar
 * escala, e 40 → 36 → 32 diz o contrário com o mesmo número no fim. É por isso
 * que os anos ficam lado a lado e a média fica ao lado deles.
 *
 * O ROCE vem primeiro de propósito: é o rácio que melhor separa uma boa empresa
 * de uma empresa grande, e é o que o crescimento perpétuo lá em cima está
 * implicitamente a assumir que se mantém para sempre.
 */
function Historial({ contas }: { contas: Fundamentais }) {
  const h = contas.historico;
  const p = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);
  const r = (v: number | null) => (v === null ? "—" : String(v).replace(".", ","));

  const linhas: { titulo: string; valores: string[]; media: string; forte?: boolean }[] = [
    {
      titulo: "ROCE",
      valores: h.map((a) => p(a.rocePct)),
      media: p(contas.medias.rocePct),
      forte: true,
    },
    { titulo: "Margem bruta", valores: h.map((a) => p(a.margemBrutaPct)), media: "—" },
    {
      titulo: "Margem operacional",
      valores: h.map((a) => p(a.margemOperacionalPct)),
      media: p(contas.medias.margemOperacionalPct),
    },
    {
      titulo: "Margem líquida",
      valores: h.map((a) => p(a.margemLiquidaPct)),
      media: p(contas.medias.margemLiquidaPct),
    },
    { titulo: "ROE", valores: h.map((a) => p(a.roePct)), media: "—" },
    {
      titulo: "Dívida / capital próprio",
      valores: h.map((a) => p(a.dividaSobreCapitalPct)),
      media: "—",
    },
    { titulo: "Liquidez corrente", valores: h.map((a) => r(a.liquidezCorrente)), media: "—" },
    { titulo: "Receita (mM)", valores: h.map((a) => r(a.receitaBilioes)), media: "—" },
    {
      titulo: "Fluxo livre (mM)",
      valores: h.map((a) => r(a.fcfBilioes)),
      media: "—",
      forte: true,
    },
    {
      titulo: "Margem do fluxo livre",
      valores: h.map((a) => p(a.margemFcfPct)),
      media: p(contas.medias.margemFcfPct),
    },
  ];

  const datas = contas.datas;
  const temDatas = datas.resultados || datas.dividendo || datas.exDividendo;

  return (
    <section className="card p-5">
      <p className="eyebrow mb-1">Historial</p>
      <p className="mb-3 text-xs leading-snug text-fg-faint">
        O que a empresa fez, para se poder julgar o que se assumiu que ela vai
        fazer. Olha para a linha inteira: uma margem de 32% depois de 22 e 26 não
        é a mesma coisa que 32% depois de 40 e 36.
      </p>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-right text-xs text-fg-muted">
              <th className="pb-2 text-left font-normal" />
              {h.map((a) => (
                <th key={a.ano} className="pb-2 font-normal">
                  {a.ano}
                </th>
              ))}
              <th className="pb-2 pl-3 font-normal">Média</th>
            </tr>
          </thead>
          <tbody className="font-mono tnum">
            {linhas.map((l) => (
              <tr key={l.titulo}>
                <td
                  className={`py-0.5 pr-3 text-left font-sans text-xs ${l.forte ? "text-fg" : "text-fg-muted"}`}
                >
                  {l.titulo}
                </td>
                {l.valores.map((v, i) => (
                  <td key={i} className={`py-0.5 text-right ${l.forte ? "text-fg" : "text-fg-muted"}`}>
                    {v}
                  </td>
                ))}
                <td className="py-0.5 pl-3 text-right text-fg-muted">{l.media}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contas.emFalta.length > 0 ? (
        <p className="mt-3 text-xs leading-snug text-fg-faint">
          A fonte não trouxe {contas.emFalta.join(", ")}. Onde está &ldquo;—&rdquo; não há
          dado — não é zero.
        </p>
      ) : null}

      {temDatas ? (
        <div className="mt-4 border-t border-hair2 pt-3">
          <p className="text-xs text-fg-muted">
            {datas.resultados ? (
              <>
                Próximos resultados a{" "}
                <span className="text-fg">
                  {new Date(`${datas.resultados}T00:00:00Z`).toLocaleDateString("pt-PT")}
                </span>
                .{" "}
              </>
            ) : null}
            {datas.exDividendo ? (
              <>
                Data-ex do dividendo a{" "}
                <span className="text-fg">
                  {new Date(`${datas.exDividendo}T00:00:00Z`).toLocaleDateString("pt-PT")}
                </span>
                .{" "}
              </>
            ) : null}
            {datas.dividendo ? (
              <>
                Pagamento a{" "}
                <span className="text-fg">
                  {new Date(`${datas.dividendo}T00:00:00Z`).toLocaleDateString("pt-PT")}
                </span>
                .
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

const LABEL: Record<CenarioId, string> = {
  baixo: "Pessimista",
  medio: "Central",
  alto: "Otimista",
};

function Linha({
  titulo,
  valores,
  destaque,
  cores,
}: {
  titulo: string;
  valores: string[];
  destaque?: boolean;
  cores?: (boolean | null)[];
}) {
  return (
    <tr>
      <td className={`py-1 pr-3 font-sans text-left text-xs ${destaque ? "text-fg" : "text-fg-muted"}`}>
        {titulo}
      </td>
      {valores.map((v, i) => {
        const cor = cores?.[i];
        return (
          <td
            key={i}
            className={`py-1 text-right ${
              cor === undefined || cor === null ? (destaque ? "text-fg" : "text-fg-muted") : cor ? "text-credit" : "text-debt"
            }`}
          >
            {v}
          </td>
        );
      })}
    </tr>
  );
}

function CampoTabela({ valor, onChange }: { valor: number; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="decimal"
      value={Number.isFinite(valor) ? String(valor).replace(".", ",") : ""}
      onChange={(e) => onChange(e.target.value)}
      className="input h-9 w-20 text-sm"
    />
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
    </div>
  );
}
