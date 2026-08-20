"use client";

/**
 * A grelha dos investimentos, com o que faz falta para encontrar um.
 *
 * **O problema é a escala.** Uma importação de corretora traz tudo o que alguma
 * vez se comprou — cinquenta produtos, muitos deles já vendidos por inteiro e
 * muitos sem símbolo de bolsa. Numa lista dessas o que se faz é **procurar um**,
 * e percorrer tudo com o dedo não é procurar.
 *
 * **Nada aqui mexe em número nenhum.** É só a lista. Uma posição a zero vale
 * zero no património, esteja à vista ou não, e filtrar não muda totais.
 *
 * **Esconder tem sempre a contagem à vista.** Fazer desaparecer fichas a quem
 * está a contar dinheiro, sem dizer quantas e sem forma de as trazer de volta,
 * seria pior do que a lista comprida.
 */

import { useMemo, useState } from "react";
import { InvestmentCard, type InvestmentCardData } from "./InvestmentCard";

/** Uma posição fechada: já não há unidades nenhumas. */
function fechada(d: InvestmentCardData): boolean {
  return d.quantity <= 0;
}

function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    // Os combinantes ficam em escapes: literais aqui seriam invisíveis no código.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const TODAS = "__todas__";

/**
 * Por que ordem se mostram.
 *
 * **Por euros e por percentagem, e não é a mesma pergunta.** Mil euros ganhos
 * numa posição de cem mil é meio por cento e é dinheiro a sério; setenta por
 * cento numa posição de duzentos euros é uma boa escolha e não muda a vida.
 * Ordenar por uma delas e chamar-lhe "os melhores" responderia sempre a meia
 * pergunta, e a metade errada muda conforme o tamanho da carteira.
 *
 * **A ordem à mão continua a ser a de omissão.** Quem arrumou as fichas
 * arrumou-as por alguma razão, e chegar à página com essa ordem desfeita é
 * perder trabalho de alguém.
 */
const ORDENS = [
  { id: "manual", label: "A minha ordem" },
  { id: "ganho-eur", label: "Ganho (€)" },
  { id: "ganho-pct", label: "Ganho (%)" },
  { id: "valor", label: "Valor" },
  { id: "nome", label: "Nome" },
] as const;
type OrdemId = (typeof ORDENS)[number]["id"];

/**
 * Ordena sem nunca inventar um lugar para quem não tem número.
 *
 * Uma posição sem cotação não tem ganho — não é ganho zero. Tratá-la como zero
 * punha-a no meio da tabela, entre os que perderam e os que ganharam, como se
 * isso fosse informação. Vai toda para o fim, e a ordem entre elas é a que
 * tinham.
 */
function ordenar(lista: InvestmentCardData[], ordem: OrdemId): InvestmentCardData[] {
  if (ordem === "manual") return lista;
  const chave = (d: InvestmentCardData): number | null => {
    if (ordem === "ganho-eur") return d.gainCents ?? null;
    if (ordem === "ganho-pct") return d.gainPct ?? null;
    if (ordem === "valor") return d.currentValueCents;
    return null;
  };
  const com = lista.map((d, i) => ({ d, i, k: chave(d) }));
  return com
    .sort((a, b) => {
      if (ordem === "nome") return a.d.name.localeCompare(b.d.name, "pt");
      if (a.k === null && b.k === null) return a.i - b.i;
      // Sem número vai para o fim, seja qual for o sentido da ordenação.
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      return b.k - a.k || a.i - b.i;
    })
    .map((x) => x.d);
}

export function InvestmentGrid({ items }: { items: InvestmentCardData[] }) {
  /**
   * As posições fechadas: escondidas por omissão, e sozinhas quando se carrega.
   *
   * **Antes era um interruptor com cara de filtro.** Carregar em "Já fechadas"
   * ACRESCENTAVA-as à lista em vez de mostrar só elas — e o resultado era a
   * Google e a NVIDIA a aparecerem debaixo de um crachá que dizia "fechadas",
   * com oitenta unidades cada. O crachá do lado ("Sem símbolo") é um filtro a
   * sério, o que tornava a incoerência ainda mais difícil de ler.
   *
   * Agora é o que diz que é. Para voltar à lista normal, desliga-se.
   */
  const [soFechadas, setSoFechadas] = useState(false);
  const [soSemSimbolo, setSoSemSimbolo] = useState(false);
  const [bolsa, setBolsa] = useState(TODAS);
  const [ordem, setOrdem] = useState<OrdemId>("manual");
  const [procura, setProcura] = useState("");

  const bolsas = useMemo(() => {
    const vistas = new Map<string, number>();
    for (const d of items) {
      const b = (d.exchange ?? "").trim();
      if (!b) continue;
      vistas.set(b, (vistas.get(b) ?? 0) + 1);
    }
    return [...vistas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const fechadas = items.filter(fechada);
  const semSimbolo = items.filter((d) => !d.symbol);
  /**
   * Os que o filtro vai mesmo mostrar, e é essa a contagem que aparece.
   *
   * O crachá dizia 11 e a lista mostrava 2: contava todos os sem símbolo, e a
   * lista escondia as posições já fechadas, que são a maioria deles. Um filtro
   * que promete onze e entrega dois não é um pormenor de contagem — passa a
   * ideia de que a lista está a esconder coisas por avaria.
   *
   * Os que faltam não desaparecem: são contados à parte e anunciados por
   * palavras, com o botão para os trazer.
   */
  const semSimboloVisiveis = semSimbolo.filter((d) => (soFechadas ? fechada(d) : !fechada(d)));
  const semSimboloFechadas = semSimbolo.length - semSimboloVisiveis.length;

  const visiveis = useMemo(() => {
    const q = normalizar(procura);
    const filtrados = items.filter((d) => {
      // Ou só as fechadas, ou nenhuma delas. Ver o comentário no estado.
      if (soFechadas ? !fechada(d) : fechada(d)) return false;
      if (soSemSimbolo && d.symbol) return false;
      if (bolsa !== TODAS && (d.exchange ?? "") !== bolsa) return false;
      if (q) {
        // Procura-se pelos dois: pelo nome do produto e pelo ticker, porque uma
        // pessoa tanto se lembra de "Alphabet" como de "googl".
        const alvo = `${normalizar(d.name)} ${normalizar(d.symbol ?? "")}`;
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    return ordenar(filtrados, ordem);
  }, [items, soFechadas, soSemSimbolo, bolsa, procura, ordem]);

  const filtrado = soSemSimbolo || soFechadas || bolsa !== TODAS || procura.trim() !== "";

  return (
    <div className="p-4">
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="inv-procura">Procurar investimento</label>
          <input
            id="inv-procura"
            type="search"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
            placeholder="Procurar por nome ou ticker"
            className="input h-9 min-w-0 flex-1 text-sm sm:max-w-xs"
          />

          <label className="sr-only" htmlFor="inv-ordem">Ordenar por</label>
          <select
            id="inv-ordem"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemId)}
            className="select h-9 w-auto text-sm"
          >
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id === "manual" ? o.label : `Ordenar por ${o.label.toLowerCase()}`}
              </option>
            ))}
          </select>

          {bolsas.length > 1 ? (
            <>
              <label className="sr-only" htmlFor="inv-bolsa">Bolsa</label>
              <select
                id="inv-bolsa"
                value={bolsa}
                onChange={(e) => setBolsa(e.target.value)}
                className="select h-9 w-auto text-sm"
              >
                <option value={TODAS}>Todas as bolsas</option>
                {bolsas.map(([b, n]) => (
                  <option key={b} value={b}>
                    {b} ({n})
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {semSimbolo.length > 0 ? (
            <button
              type="button"
              onClick={() => setSoSemSimbolo((v) => !v)}
              aria-pressed={soSemSimbolo}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                soSemSimbolo
                  ? "border-fg bg-fg text-bg"
                  : "border-hair text-fg-muted hover:border-fg/30 hover:text-fg"
              }`}
            >
              Sem símbolo ({semSimboloVisiveis.length})
            </button>
          ) : null}

          {fechadas.length > 0 ? (
            <button
              type="button"
              onClick={() => setSoFechadas((v) => !v)}
              aria-pressed={soFechadas}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                soFechadas
                  ? "border-fg bg-fg text-bg"
                  : "border-hair text-fg-muted hover:border-fg/30 hover:text-fg"
              }`}
            >
              {/* A contagem fica à vista mesmo com o filtro desligado: é a
                  diferença entre "arrumado" e "desaparecido". */}
              Só as fechadas ({fechadas.length})
            </button>
          ) : null}

          {filtrado ? (
            <button
              type="button"
              onClick={() => {
                setProcura("");
                setBolsa(TODAS);
                setSoSemSimbolo(false);
                setSoFechadas(false);
              }}
              className="btn-ghost px-2 text-xs"
            >
              Limpar
            </button>
          ) : null}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          {filtrado
            ? "Nenhum investimento com estes filtros."
            : "Só há posições fechadas por aqui: carrega em “Só as fechadas” para as veres."}
        </p>
      ) : (
        <>
          {/* Quantos ficaram de fora, e porquê. Uma lista filtrada sem contagem
              lê-se como a lista toda. */}
          {visiveis.length < items.length ? (
            <p className="mb-2 text-xs text-fg-faint">
              {visiveis.length} de {items.length}.
              {/* O resto dos sem símbolo, quando estão escondidos por serem
                  posições fechadas. Sem esta frase, quem procura os onze que a
                  app anunciou fica a achar que nove se perderam. */}
              {soSemSimbolo && semSimboloFechadas > 0 ? (
                <>
                  {" "}
                  Há {semSimboloFechadas === 1 ? "mais 1 sem símbolo" : `mais ${semSimboloFechadas} sem símbolo`}{" "}
                  em posições já fechadas, e a essas o símbolo já não muda nada.{" "}
                  <button
                    type="button"
                    onClick={() => setSoFechadas(true)}
                    className="underline underline-offset-2 hover:text-fg"
                  >
                    Mostrar na mesma
                  </button>
                  .
                </>
              ) : null}
            </p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((d, i) => (
              <InvestmentCard
                key={d.id}
                data={{
                  ...d,
                  // Arrumar uma lista filtrada mexia em posições que não se
                  // veem: o que está escondido continua lá e a ordem final
                  // saía diferente do que se viu a fazer.
                  podeMover: !filtrado && ordem === "manual",
                  primeiro: i === 0,
                  ultimo: i === visiveis.length - 1,
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
