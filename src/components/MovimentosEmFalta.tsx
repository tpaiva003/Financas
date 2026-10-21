"use client";

/**
 * O convite a dar história aos investimentos que não a têm.
 *
 * **Porquê interromper.** Um investimento sem movimentos não está partido — a
 * posição está lá e o património está certo. O que ele não tem é passado: sem
 * uma compra com data não há TIR, não há TWR e não há comparação com o índice,
 * e essas são as contas que dizem se valeu a pena. Quem registou a posição não
 * tem como saber que lhe falta isso, porque no ecrã não falta nada.
 *
 * **Uma vez por visita.** Fecha-se e não volta a aparecer enquanto o
 * separador estiver aberto. Volta amanhã, porque o problema também volta — mas
 * quem está a fazer outra coisa não é interrompido duas vezes seguidas.
 *
 * **A data é de quem sabe.** Vem preenchida quando o bem a tem, e um bem sem
 * data escolhida é saltado em vez de receber a de hoje: a data diz quanto tempo
 * o dinheiro esteve a render, e inventá-la daria uma TIR absurda com ar de
 * conta feita.
 */

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { criarMovimentosEmFaltaAction, type ActionState } from "@/app/(app)/actions";
import { formatCents } from "@/lib/domain";
import { Modal } from "./Modal";

const vazio: ActionState = {};
const DISPENSADO = "rachar-movimentos-em-falta";

export interface BemSemMovimento {
  id: string;
  nome: string;
  quantity: number;
  unitCostCents: number;
  purchasedAt: string | null;
}

function Criar({ quantos }: { quantos: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A registar…" : quantos === 1 ? "Registar a compra" : "Registar as compras"}
    </button>
  );
}

export function MovimentosEmFalta({ bens }: { bens: BemSemMovimento[] }) {
  const [aberto, setAberto] = useState(false);
  const [state, criar] = useFormState(criarMovimentosEmFaltaAction, vazio);

  useEffect(() => {
    if (bens.length === 0) return;
    try {
      if (sessionStorage.getItem(DISPENSADO) === "1") return;
    } catch {
      // Navegação privada: mostra-se na mesma, que é o lado seguro.
    }
    setAberto(true);
  }, [bens.length]);

  function fechar() {
    try {
      sessionStorage.setItem(DISPENSADO, "1");
    } catch {
      // Ver acima.
    }
    setAberto(false);
  }

  /**
   * O resultado vem à frente de tudo, incluindo da lista já vazia.
   *
   * Gravar faz o servidor voltar a desenhar a página, e desta vez sem
   * investimentos em falta — se a lista vazia mandasse, a caixa desaparecia no
   * momento em que se carregava, sem dizer o que tinha feito. Quem carrega num
   * botão que apaga a caixa fica sem saber se aquilo correu bem.
   */
  if (aberto && state.ok) {
    return (
      <Modal titulo="Feito" aoFechar={fechar}>
        <p className="mt-3 text-sm text-fg-muted">{state.message}</p>
        <button type="button" onClick={fechar} className="btn-primary mt-4 text-xs">
          Fechar
        </button>
      </Modal>
    );
  }

  if (!aberto || bens.length === 0) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      titulo={
        bens.length === 1
          ? "Falta a compra de um investimento"
          : `Faltam as compras de ${bens.length} investimentos`
      }
      aoFechar={fechar}
    >
      <p className="mt-3 text-sm leading-snug text-fg-muted">
        {bens.length === 1 ? "Este investimento tem" : "Estes investimentos têm"} a
        posição escrita à mão e nenhum movimento. O património está certo, mas
        sem uma compra com data não há rentabilidade ao ano nem comparação com o
        índice: falta saber <span className="text-fg">quando</span> é que o
        dinheiro entrou.
      </p>

      <form action={criar} className="mt-4 space-y-3">
        {bens.map((b) => (
          <div key={b.id} className="rounded-xl border border-hair2 p-3">
            <p className="truncate text-sm font-medium text-fg">{b.nome}</p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
              <span className="so-aberto">{b.quantity} un. a </span>
              <span className="so-privado">comprado a </span>
              <span className="preco-un">{formatCents(b.unitCostCents)}</span>
            </p>
            <label className="label mt-2" htmlFor={`data-${b.id}`}>
              Data da compra
            </label>
            <input
              id={`data-${b.id}`}
              name={`data-${b.id}`}
              type="date"
              max={hoje}
              defaultValue={b.purchasedAt ?? ""}
              className="input"
            />
          </div>
        ))}

        <p className="text-[11px] leading-snug text-fg-faint">
          Sem data, fica como está: mais vale um investimento sem histórico do
          que um histórico com a data errada, que faz a rentabilidade mentir.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Criar quantos={bens.length} />
          <button type="button" onClick={fechar} className="btn-ghost px-2 text-xs">
            Agora não
          </button>
          {state.error ? (
            <span role="alert" className="text-[11px] text-debt">
              {state.error}
            </span>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
