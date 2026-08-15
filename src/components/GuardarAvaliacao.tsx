"use client";

/**
 * Guardar o estudo no funil.
 *
 * **É isto que separa uma calculadora de uma folha de cálculo a sério.** O
 * número sozinho não decide nada; o que decide é o que se faz a seguir, e é aí
 * que uma folha falha — o estudo fica no ficheiro, a decisão fica na cabeça, e
 * três meses depois já ninguém sabe se aquela empresa foi descartada por cara,
 * por má, ou se só ficou por rever.
 *
 * **Manda os pressupostos, não o resultado.** O servidor refaz a conta: aceitar
 * o número calculado aqui permitia gravar um preço ponderado que não sai dos
 * pressupostos ao lado dele, e o estudo passava a mentir sobre si próprio para
 * sempre.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { guardarAvaliacaoAction, type ActionState } from "@/app/(app)/actions";
import {
  ETAPAS,
  ETAPA_EXPLICACAO,
  ETAPA_LABEL,
  etapaSugerida,
  type CenarioDcf,
  type EtapaAvaliacao,
} from "@/lib/domain";

const vazio: ActionState = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-sm" disabled={pending}>
      {pending ? "A guardar…" : "Guardar no funil"}
    </button>
  );
}

export function GuardarAvaliacao({
  nome,
  simbolo,
  fcfCents,
  acoes,
  dividaLiquidaCents,
  descontoPct,
  perpetuoPct,
  anos,
  margemPct,
  precoCents,
  cenarios,
  notas,
  atrativo,
  valuationId,
  racios,
}: {
  nome: string;
  simbolo: string;
  fcfCents: number;
  acoes: number;
  dividaLiquidaCents: number;
  descontoPct: number;
  perpetuoPct: number;
  anos: number;
  margemPct: number;
  precoCents: number | null;
  cenarios: CenarioDcf[];
  notas: string;
  atrativo: boolean | null;
  /**
   * A linha do funil a preencher, quando isto veio de lá.
   *
   * Sem ele, estudar uma empresa que já estava apontada criava um segundo
   * cartão da mesma empresa e o primeiro ficava marcado como substituído — a
   * app a duplicar o que a pessoa acabou de fazer o trabalho de ligar.
   */
  valuationId: string | null;
  /**
   * Os rácios que a busca de dados trouxe, para irem com o estudo.
   *
   * Congelam com ele: um rácio não é uma propriedade que dure, é o que a
   * empresa mostrava naquele dia. É o que permite comparar um estudo novo com
   * os anteriores do mesmo setor.
   */
  racios?: {
    setor: string | null;
    rocePct: number | null;
    margemOperacionalPct: number | null;
    margemFcfPct: number | null;
    crescimentoFcfPct: number | null;
  } | null;
}) {
  const [state, guardar] = useFormState(guardarAvaliacaoAction, vazio);
  // A etapa que o veredicto sugere, e não a que a app impõe: um DCF diz se o
  // preço serve aos pressupostos de quem o escreveu, não se a empresa se compra.
  const [etapa, setEtapa] = useState<EtapaAvaliacao>(etapaSugerida(atrativo));

  if (state.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm leading-snug text-fg-muted">
        {state.message}{" "}
        <a href="/patrimonio/avaliacoes" className="underline underline-offset-2 hover:text-fg">
          Ver o funil
        </a>
        .
      </p>
    );
  }

  if (!nome.trim()) {
    return (
      <p className="text-xs text-fg-faint">
        Escreve o nome da empresa lá em cima para poderes guardar este estudo.
      </p>
    );
  }

  return (
    <form action={guardar} className="card space-y-3 p-5">
      <input type="hidden" name="name" value={nome} />
      <input type="hidden" name="symbol" value={simbolo} />
      <input type="hidden" name="fcfCents" value={fcfCents} />
      <input type="hidden" name="shares" value={acoes} />
      <input type="hidden" name="netDebtCents" value={dividaLiquidaCents} />
      <input type="hidden" name="discountPct" value={descontoPct} />
      <input type="hidden" name="perpetualPct" value={perpetuoPct} />
      <input type="hidden" name="years" value={anos} />
      <input type="hidden" name="marginPct" value={margemPct} />
      {precoCents !== null ? <input type="hidden" name="priceCents" value={precoCents} /> : null}
      <input type="hidden" name="scenarios" value={JSON.stringify(cenarios)} />
      <input type="hidden" name="notes" value={notas} />
      <input type="hidden" name="stage" value={etapa} />
      {valuationId ? <input type="hidden" name="valuationId" value={valuationId} /> : null}
      {/* Vazios quando a busca não correu: a ação deixa-os de fora do que grava,
          para um estudo refeito à mão não apagar os rácios de uma passagem
          anterior. */}
      {racios?.setor ? <input type="hidden" name="sector" value={racios.setor} /> : null}
      {racios?.rocePct !== null && racios?.rocePct !== undefined ? (
        <input type="hidden" name="rocePct" value={racios.rocePct} />
      ) : null}
      {racios?.margemOperacionalPct !== null && racios?.margemOperacionalPct !== undefined ? (
        <input type="hidden" name="margemOperacionalPct" value={racios.margemOperacionalPct} />
      ) : null}
      {racios?.margemFcfPct !== null && racios?.margemFcfPct !== undefined ? (
        <input type="hidden" name="margemFcfPct" value={racios.margemFcfPct} />
      ) : null}
      {racios?.crescimentoFcfPct !== null && racios?.crescimentoFcfPct !== undefined ? (
        <input type="hidden" name="crescimentoFcfPct" value={racios.crescimentoFcfPct} />
      ) : null}

      <div>
        <p className="eyebrow">{valuationId ? "Guardar no funil" : "Guardar"}</p>
        <p className="mt-2 text-xs leading-snug text-fg-faint">
          Fica com os pressupostos de hoje e nunca se recalcula sozinho: uma
          decisão tomada com este número tem de continuar a poder ser lida com
          ele.{" "}
          {valuationId
            ? "Vai para a empresa que já tinhas no funil, em vez de criar outro cartão."
            : "Reavaliar mais tarde cria um estudo novo, e o antigo fica lá com a data."}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="aval-etapa">
          Em que etapa fica
        </label>
        <select
          id="aval-etapa"
          value={etapa}
          onChange={(e) => setEtapa(e.target.value as EtapaAvaliacao)}
          className="input"
        >
          {ETAPAS.map((e) => (
            <option key={e} value={e}>
              {ETAPA_LABEL[e]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-fg-faint">{ETAPA_EXPLICACAO[etapa]}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Botao />
        {state.error ? (
          <span role="alert" className="text-xs leading-snug text-debt">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
