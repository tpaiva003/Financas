"use client";

/**
 * Por que ordem se mostram os bens que não são investimentos.
 *
 * **Os investimentos já tinham isto e o resto não.** Uma carteira de ações
 * ordena-se por ganho; um imóvel, uma conta a prazo ou um crédito ordenam-se
 * por valor, por taxa ou por nome — e com meia dúzia de dívidas, saber qual é a
 * mais cara é a pergunta que se faz. A lista vinha sempre pela ordem de criação
 * e não havia forma de a mudar sem arrastar as fichas uma a uma.
 *
 * **Ordena no cliente, e é de propósito.** A ordem à mão está gravada e é a de
 * omissão; esta é uma vista temporária sobre a mesma lista, que não mexe em
 * nada e desaparece ao recarregar. Gravá-la faria duas ordens a competir pela
 * mesma lista, e a que estava lá é de quem a arrumou.
 *
 * O `data-*` no elemento é o que permite ordenar sem o servidor: os valores
 * vêm no HTML, e aqui só se trocam os filhos de sítio.
 */

import { useEffect, useState } from "react";

const ORDENS = [
  { id: "manual", label: "A minha ordem" },
  { id: "valor", label: "Valor" },
  { id: "taxa", label: "Taxa" },
  { id: "nome", label: "Nome" },
] as const;
type OrdemId = (typeof ORDENS)[number]["id"];

export function AssetListSort({ listaId }: { listaId: string }) {
  const [ordem, setOrdem] = useState<OrdemId>("manual");

  useEffect(() => {
    const lista = document.getElementById(listaId);
    if (!lista) return;
    const itens = Array.from(lista.children) as HTMLElement[];

    // A ordem original guarda-se na primeira passagem: sem isto, voltar a "A
    // minha ordem" devolvia a última ordenação em vez da de quem arrumou.
    for (const [i, el] of itens.entries()) {
      if (!el.dataset.original) el.dataset.original = String(i);
    }

    const chave = (el: HTMLElement): number | null => {
      if (ordem === "valor") return Number(el.dataset.valor ?? "");
      if (ordem === "taxa") {
        const t = el.dataset.taxa;
        // Sem taxa não é taxa zero: um imóvel não rende juro nenhum e pô-lo
        // entre os créditos baratos e os caros era inventar informação.
        return t === undefined || t === "" ? null : Number(t);
      }
      return null;
    };

    const ordenados = [...itens].sort((a, b) => {
      const original = Number(a.dataset.original) - Number(b.dataset.original);
      if (ordem === "manual") return original;
      if (ordem === "nome") {
        return (a.dataset.nome ?? "").localeCompare(b.dataset.nome ?? "", "pt");
      }
      const ka = chave(a);
      const kb = chave(b);
      if (ka === null && kb === null) return original;
      // Quem não tem o número vai para o fim, seja qual for o sentido.
      if (ka === null) return 1;
      if (kb === null) return -1;
      return kb - ka || original;
    });

    for (const el of ordenados) lista.appendChild(el);
  }, [ordem, listaId]);

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`ordem-${listaId}`}>
        Ordenar por
      </label>
      <select
        id={`ordem-${listaId}`}
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
    </div>
  );
}
