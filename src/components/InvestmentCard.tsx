"use client";

/**
 * Um investimento, em cartão quadrado.
 *
 * **Porquê mudar de linha para cartão.** Em lista comprida todas as posições
 * parecem iguais e é preciso ler para as distinguir. Numa carteira com uma dúzia
 * de ações, o que a pessoa faz é procurar uma — e para isso o emblema com cor
 * própria e o ticker em destaque valem mais do que qualquer texto. Os quatro
 * números que interessam ao relance (quantidade, o que custou, o que vale, e o
 * ganho) cabem no quadrado; o resto está a um toque de distância.
 *
 * **Um cartão por ativo, nunca por compra.** Comprar hoje mais da mesma ação não
 * cria um cartão novo: acrescenta um movimento ao que já existe, e o cartão
 * mostra quantos movimentos tem. A importação já se comportava assim (procura o
 * ativo pelo nome antes de criar), e o botão de registar movimento aqui fecha o
 * mesmo círculo à mão — que é o que faz falta para manter isto atualizado depois
 * da primeira importação.
 */

import { useState } from "react";
import Link from "next/link";
import { formatCents, monogramFor } from "@/lib/domain";
import { moverAtivoAction } from "@/app/(app)/actions";
import { QuickTradeForm } from "./QuickTradeForm";

export interface InvestmentCardData {
  id: string;
  name: string;
  symbol: string | null;
  /** Há domínio de marca gravado? Sem ele nem se pede o logo. */
  temLogo?: boolean;
  quantity: number;
  /** Custo médio por unidade. */
  unitCostCents: number | null;
  /** Cotação atual por unidade. */
  unitPriceCents: number | null;
  currentValueCents: number;
  /** Ganho total, quando há preço para o calcular. */
  gainCents: number | null;
  gainPct: number | null;
  tradeCount: number;
  /** A bolsa como a corretora a escreve. Vem do ficheiro importado. */
  exchange?: string | null;
  /** Dá para mover este cartão? Só quando a lista não está filtrada. */
  podeMover?: boolean;
  primeiro?: boolean;
  ultimo?: boolean;
  /** A data do fecho, quando há cotação. */
  quoteDate?: string | null;
  /**
   * Porque é que não há cotação, quando não há.
   *
   * O cartão dizia só "sem cotação" e mais nada. "A fonte recusou o pedido" e
   * "este símbolo não existe" são problemas opostos — um espera-se, o outro
   * corrige-se à mão — e sem o motivo não havia como saber qual era.
   */
  quoteProblem?: string | null;
}

/** Quantidades vêm com casas decimais nos ETF fracionados; inteiros ficam limpos. */
function fmtQty(q: number): string {
  const s = Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

export function InvestmentCard({ data }: { data: InvestmentCardData }) {
  const [registando, setRegistando] = useState(false);
  const { letters, hue } = monogramFor(data.symbol, data.name);

  const ganhoPositivo = data.gainCents !== null && data.gainCents >= 0;

  return (
    <li className="card flex flex-col p-4">
      <div className="flex items-start gap-3">
        {/*
          O emblema. A cor sai do próprio símbolo e é sempre a mesma, o que dá
          memória visual à carteira. Ver `domain/monogram.ts` para a razão de
          não irmos buscar logos a um serviço externo.
        */}
        {/*
          O logo por cima do monograma, e o monograma sempre por baixo.

          O logo vem da rota `/api/logo/[id]` desta app e nunca do browser: um
          serviço de logos pedido pelo browser ficaria com a lista exacta das
          ações de quem usa a app. Ver o cabeçalho dessa rota.

          O monograma fica **debaixo** e não como alternativa condicional: um
          ícone que falha a carregar deixa o quadrado vazio, e assim o que se vê
          é sempre alguma coisa. É também o que evita o salto de disposição
          enquanto a imagem não chega.
        */}
        <span
          aria-hidden="true"
          className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl font-mono text-sm font-semibold tracking-tight"
          style={{
            backgroundColor: `hsl(${hue} 45% 88%)`,
            color: `hsl(${hue} 55% 24%)`,
          }}
        >
          {letters}
          {data.temLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/logo/${data.id}`}
              alt=""
              loading="lazy"
              onError={(e) => {
                // Um logo que não veio esconde-se e fica o monograma. Um ícone
                // partido numa carteira lê-se como avaria da app.
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full bg-white object-contain p-1.5"
            />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <Link
            href={`/patrimonio/ativos/${data.id}`}
            className="block truncate font-mono text-sm font-semibold text-fg hover:underline"
          >
            {data.symbol ? data.symbol.toUpperCase() : data.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-fg-muted" title={data.name}>
            {data.symbol ? data.name : "Sem símbolo de bolsa"}
          </p>
          {/* A praça, quando a corretora a disse. É o que distingue duas
              empresas com nomes parecidos em países diferentes. */}
          {data.exchange ? (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
              {data.exchange}
            </p>
          ) : null}
        </div>
      </div>

      {/* Mover só aparece com a lista inteira à vista: arrumar o que está
          filtrado mexe em posições que não se veem. */}
      {data.podeMover ? (
        <div className="mt-2 flex items-center gap-1">
          <form action={moverAtivoAction}>
            <input type="hidden" name="id" value={data.id} />
            <input type="hidden" name="dir" value="cima" />
            <button
              type="submit"
              disabled={data.primeiro}
              aria-label={`Mover ${data.name} para trás`}
              className="btn-ghost px-1.5 text-xs disabled:opacity-25"
            >
              ←
            </button>
          </form>
          <form action={moverAtivoAction}>
            <input type="hidden" name="id" value={data.id} />
            <input type="hidden" name="dir" value="baixo" />
            <button
              type="submit"
              disabled={data.ultimo}
              aria-label={`Mover ${data.name} para a frente`}
              className="btn-ghost px-1.5 text-xs disabled:opacity-25"
            >
              →
            </button>
          </form>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">Unidades</p>
          <p className="font-mono text-sm tnum text-fg">{fmtQty(data.quantity)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">Vale hoje</p>
          <p className="font-mono text-sm tnum text-fg"><span className="dinheiro">{formatCents(data.currentValueCents)}</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">Custo médio</p>
          <p className="font-mono text-sm tnum text-fg-muted">
            {data.unitCostCents === null ? "-" : <span className="dinheiro">{formatCents(data.unitCostCents)}</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">Preço atual</p>
          <p className="font-mono text-sm tnum text-fg-muted">
            {data.unitPriceCents === null ? "-" : <span className="dinheiro">{formatCents(data.unitPriceCents)}</span>}
          </p>
        </div>
      </div>

      {/* O ganho é o número que se procura primeiro, por isso fica sozinho e
          com cor. Sem cotação não há ganho nenhum para mostrar — e dizê-lo é
          melhor do que mostrar zero, que se leria como "não subiu nem desceu". */}
      <div className="mt-3 border-t border-hair2 pt-3">
        {data.gainCents === null ? (
          <>
            <p className="text-xs text-fg-faint">
              Sem cotação, não dá para saber o ganho.
            </p>
            {data.quoteProblem ? (
              <p className="mt-1 text-[11px] leading-snug text-debt">{data.quoteProblem}</p>
            ) : null}
          </>
        ) : (
          <p className={`font-mono text-base tnum ${ganhoPositivo ? "text-credit" : "text-debt"}`}>
            {ganhoPositivo ? "+" : ""}
            <span className="dinheiro">{formatCents(data.gainCents)}</span>
            {data.gainPct !== null ? (
              <span className="ml-1.5 text-xs">
                ({ganhoPositivo ? "+" : ""}
                {data.gainPct.toFixed(1).replace(".", ",")}%)
              </span>
            ) : null}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Link
          href={`/patrimonio/ativos/${data.id}`}
          className="text-xs text-fg-muted hover:text-fg"
        >
          {data.tradeCount > 0
            ? `${data.tradeCount} movimento${data.tradeCount === 1 ? "" : "s"}`
            : "Sem movimentos"}
        </Link>
        <button
          type="button"
          onClick={() => setRegistando((v) => !v)}
          className="btn-ghost h-8 px-2.5 text-xs"
          aria-expanded={registando}
        >
          {registando ? "Fechar" : "Registar"}
        </button>
      </div>

      {registando ? (
        <div className="mt-3 border-t border-hair2 pt-3">
          <QuickTradeForm
            assetId={data.id}
            unitPriceCents={data.unitPriceCents}
            maxQuantity={data.quantity}
            onDone={() => setRegistando(false)}
          />
        </div>
      ) : null}
    </li>
  );
}
