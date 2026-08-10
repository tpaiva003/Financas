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

export function InvestmentGrid({ items }: { items: InvestmentCardData[] }) {
  const [mostrarFechadas, setMostrarFechadas] = useState(false);
  const [soSemSimbolo, setSoSemSimbolo] = useState(false);
  const [bolsa, setBolsa] = useState(TODAS);
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

  const visiveis = useMemo(() => {
    const q = normalizar(procura);
    return items.filter((d) => {
      if (!mostrarFechadas && fechada(d)) return false;
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
  }, [items, mostrarFechadas, soSemSimbolo, bolsa, procura]);

  const filtrado = soSemSimbolo || bolsa !== TODAS || procura.trim() !== "";

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
              Sem símbolo ({semSimbolo.length})
            </button>
          ) : null}

          {fechadas.length > 0 ? (
            <button
              type="button"
              onClick={() => setMostrarFechadas((v) => !v)}
              aria-pressed={mostrarFechadas}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                mostrarFechadas
                  ? "border-fg bg-fg text-bg"
                  : "border-hair text-fg-muted hover:border-fg/30 hover:text-fg"
              }`}
            >
              {/* A contagem fica à vista mesmo com o filtro desligado: é a
                  diferença entre "arrumado" e "desaparecido". */}
              Já fechadas ({fechadas.length})
            </button>
          ) : null}

          {filtrado || mostrarFechadas ? (
            <button
              type="button"
              onClick={() => {
                setProcura("");
                setBolsa(TODAS);
                setSoSemSimbolo(false);
                setMostrarFechadas(false);
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
            : "Só há posições fechadas por aqui — carrega em “Já fechadas” para as veres."}
        </p>
      ) : (
        <>
          {/* Quantos ficaram de fora, e porquê. Uma lista filtrada sem contagem
              lê-se como a lista toda. */}
          {visiveis.length < items.length ? (
            <p className="mb-2 text-xs text-fg-faint">
              {visiveis.length} de {items.length}.
            </p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((d) => (
              <InvestmentCard key={d.id} data={d} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
