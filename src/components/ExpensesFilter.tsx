"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Opt {
  id: string;
  name: string;
}

interface Initial {
  q: string;
  categoryId: string;
  payerId: string;
  kind: string;
  from: string;
  to: string;
}

export function ExpensesFilter({
  categories,
  members,
  initial,
}: {
  categories: Opt[];
  members: Opt[];
  initial: Initial;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [payerId, setPayerId] = useState(initial.payerId);
  const [kind, setKind] = useState(initial.kind);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Aplica os filtros ao vivo (sem botão), com pequeno debounce no texto.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (categoryId) p.set("categoryId", categoryId);
      if (payerId) p.set("payerId", payerId);
      if (kind) p.set("kind", kind);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      router.replace(qs ? `/despesas?${qs}` : "/despesas", { scroll: false });
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, categoryId, payerId, kind, from, to, router]);

  const clear = () => {
    setQ("");
    setCategoryId("");
    setPayerId("");
    setKind("");
    setFrom("");
    setTo("");
  };

  const hasFilters = q || categoryId || payerId || kind || from || to;

  return (
    <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      <div className="col-span-2">
        <label className="label" htmlFor="q">Pesquisar</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="descrição…" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="f-cat">Categoria</label>
        <select id="f-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-kind">Tipo</label>
        <select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="select">
          <option value="">Todas</option>
          <option value="shared">Partilhada</option>
          <option value="personal">Pessoal</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-payer">Quem pagou</label>
        <select id="f-payer" value={payerId} onChange={(e) => setPayerId(e.target.value)} className="select">
          <option value="">Todos</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-from">De</label>
        <input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="f-to">Até</label>
        <input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
      </div>
      {hasFilters ? (
        <div className="col-span-2 flex items-end sm:col-span-4">
          <button type="button" onClick={clear} className="btn-secondary">Limpar filtros</button>
        </div>
      ) : null}
    </div>
  );
}
