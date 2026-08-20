"use client";

/**
 * Modo privacidade: esconde os valores em euros, deixa o resto à vista.
 *
 * **Para que serve.** Mostrar a app a alguém, gravar o ecrã ou tirar uma
 * captura sem expor quanto se ganha, quanto se deve ou quanto vale a carteira.
 * Não é uma tranca de segurança: é uma cortina, e serve exatamente para isso.
 *
 * **O que fica escondido e o que fica.** Só os montantes em euros. As
 * percentagens, as datas, as contagens, os nomes e a forma dos gráficos
 * continuam a ver-se, porque é isso que faz a app continuar a ser legível a
 * quem está a ver: "estás 3% à frente do índice" diz o que interessa sem dizer
 * de quanto se fala.
 *
 * **É uma preferência do aparelho, não da conta** (como o tema): faz sentido
 * ligá-la no portátil que está a projetar e deixá-la desligada no telemóvel.
 * E aplica-se antes de pintar, senão os valores apareciam à vista durante um
 * instante em cada navegação, que é precisamente o que isto evita.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "rachar-privado";

/**
 * Corre antes de pintar, no `<head>`. Sem isto, cada navegação mostrava os
 * valores um instante antes de os tapar, e num ecrã gravado esse instante fica
 * lá para sempre.
 */
export const PRIVACY_SCRIPT = `try{if(localStorage.getItem("${STORAGE_KEY}")==="1")document.documentElement.dataset.privado="1";}catch(e){}`;

function aplicar(privado: boolean) {
  if (privado) document.documentElement.dataset.privado = "1";
  else delete document.documentElement.dataset.privado;
  try {
    if (privado) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navegação privada ou armazenamento cheio: vale só para esta visita.
  }
}

export function PrivacyToggle() {
  const [privado, setPrivado] = useState(false);

  // O estado real só se sabe no cliente; até lá o botão mostra o predefinido.
  useEffect(() => {
    setPrivado(document.documentElement.dataset.privado === "1");
  }, []);

  const seguinte = !privado;

  return (
    <button
      type="button"
      onClick={() => {
        aplicar(seguinte);
        setPrivado(seguinte);
      }}
      className="grid h-9 w-9 place-items-center rounded-full border border-hair text-fg-muted transition-colors hover:border-fg/30 hover:text-fg"
      aria-pressed={privado}
      aria-label={seguinte ? "Esconder os valores em euros" : "Mostrar os valores em euros"}
      title={seguinte ? "Esconder valores" : "Mostrar valores"}
    >
      {privado ? <IconOlhoFechado /> : <IconOlho />}
    </button>
  );
}

function IconOlho() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function IconOlhoFechado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-6.5 10-6.5c1.7 0 3.2.4 4.5 1M22 12s-3.5 6.5-10 6.5c-1.7 0-3.2-.4-4.5-1" />
      <path d="M4 4l16 16" />
    </svg>
  );
}
