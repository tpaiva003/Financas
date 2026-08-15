"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O ecrã do herói, em HTML vivo e não numa imagem.
 *
 * Três razões para não ser uma captura: o maior elemento da primeira vista
 * passa a ser texto (o browser pinta-o mais cedo do que pintaria uma imagem de
 * duzentos kilobytes), fica nítido em qualquer ecrã, e permite mexer.
 *
 * O que demonstra é o invariante que mais custa explicar por palavras: **quem
 * pagou é independente de como se divide**. O André pagou o jantar todo nos
 * dois casos; o que muda ao carregar nos botões é só quanto é que a Maria lhe
 * deve. Uma frase não faz isto em oitocentos milissegundos.
 *
 * Anda sozinho uma vez, ao fim de 1,8s, e fica quieto a seguir. Repetir em
 * ciclo dava um anúncio a piscar ao lado do texto que se está a ler.
 *
 * O conteúdo é desenhado num tamanho fixo e depois **escalado** para a moldura,
 * como um telemóvel a sério faz. Sem isto, num portátil de 1366x768 a moldura
 * encolhia (para não ocupar o ecrã todo) mas as letras não, e o ecrã ficava
 * cortado a meio de uma frase.
 */

/** Tamanho em que este ecrã foi desenhado. O resto é regra de três. */
const LARGURA_BASE = 320;
const ALTURA_BASE = 692;

const TOTAL_CENTS = 5240;

type Divisao = "meias" | "60/40";

/** Quota do André em cada divisão. O resto é da Maria. */
const QUOTA: Record<Divisao, number> = { meias: 0.5, "60/40": 0.6 };

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function HeroScreen() {
  const [divisao, setDivisao] = useState<Divisao>("meias");
  const [mexido, setMexido] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const moldura = ref.current?.parentElement;
    if (!moldura || typeof ResizeObserver === "undefined") return;
    const medir = () => setEscala(moldura.clientWidth / LARGURA_BASE);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(moldura);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (mexido) return;
    const t = setTimeout(() => setDivisao("60/40"), 1800);
    return () => clearTimeout(t);
  }, [mexido]);

  const escolher = (d: Divisao) => {
    setMexido(true);
    setDivisao(d);
  };

  const andreCents = Math.round(TOTAL_CENTS * QUOTA[divisao]);
  const mariaCents = TOTAL_CENTS - andreCents;

  return (
    <div
      ref={ref}
      className="absolute left-0 top-0 flex flex-col px-5 pb-5 pt-9 text-left"
      style={{
        width: LARGURA_BASE,
        height: ALTURA_BASE,
        transform: `scale(${escala})`,
        transformOrigin: "top left",
      }}
    >
      <p className="chip self-start">Exemplo</p>

      <p className="mt-5 font-display text-lg font-semibold leading-tight text-fg">
        Jantar restaurante Cais
      </p>
      <p className="mt-1 font-mono text-2xl tnum text-fg">{euros(TOTAL_CENTS)}</p>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
        Quem pagou
      </p>
      <p className="mt-1.5 text-sm text-fg">André, por inteiro</p>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
        Como se divide
      </p>
      <div className="mt-2 flex gap-2">
        {(["meias", "60/40"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => escolher(d)}
            aria-pressed={divisao === d}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 ${
              divisao === d
                ? "bg-fg text-bg"
                : "border border-hair text-fg-muted hover:text-fg"
            }`}
          >
            {d === "meias" ? "Meias" : "60/40"}
          </button>
        ))}
      </div>

      {/*
        A barra é a mesma informação das linhas, em largura. É o que faz a
        mudança ler-se num relance, sem se ter de comparar dois números.
      */}
      <div
        className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-panel2"
        role="img"
        aria-label={`André ${Math.round(QUOTA[divisao] * 100)}%, Maria ${Math.round(
          (1 - QUOTA[divisao]) * 100,
        )}%`}
      >
        <span
          className="bg-fg/70 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${QUOTA[divisao] * 100}%` }}
        />
        <span className="flex-1 bg-fg/20" />
      </div>

      <div className="mt-3 space-y-0">
        <Linha nome="André" valor={euros(andreCents)} />
        <Linha nome="Maria" valor={euros(mariaCents)} />
      </div>

      {/*
        Segue as linhas, não vai colado ao fundo: encostado lá em baixo abria
        um buraco a meio do ecrã, que é o contrário do que uma app faz.
      */}
      <div className="mt-7 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
          Fica a dever
        </p>
        <p className="mt-1 text-sm text-fg">
          Maria a André{" "}
          <span className="font-mono tnum text-credit transition-colors duration-300">
            {euros(mariaCents)}
          </span>
        </p>
      </div>

      {/*
        A barra de baixo, como na app a sério em telemóvel. Sem ela o ecrã
        acabava a meio e ficava um terço de vazio por baixo do último número,
        que é o que denuncia uma maqueta.
      */}
      <div className="mt-auto flex items-stretch justify-around pt-4">
        {[
          ["Saldo", true],
          ["Movimentos", false],
          ["Análise", false],
          ["Património", false],
        ].map(([rotulo, ativo]) => (
          <span
            key={rotulo as string}
            className={`relative flex flex-1 flex-col items-center gap-1 ${
              ativo ? "text-fg" : "text-fg-faint"
            }`}
          >
            {ativo ? (
              <span aria-hidden className="absolute -top-1 h-1 w-1 rounded-full bg-fg" />
            ) : null}
            <span aria-hidden className="h-3.5 w-3.5 rounded-[3px] border border-current opacity-70" />
            <span className="font-mono text-[7px] uppercase tracking-[0.08em]">
              {rotulo as string}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Linha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div className="row">
      <span className="flex-1 text-sm text-fg-muted">{nome}</span>
      <span className="font-mono text-sm tnum text-fg transition-opacity duration-300">{valor}</span>
    </div>
  );
}
