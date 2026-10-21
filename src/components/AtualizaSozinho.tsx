"use client";

/**
 * Vai buscar a página outra vez de vez em quando, para o ecrã não mentir.
 *
 * **Porquê.** Quem abre um pedido de ajuda fica à espera. Se o estado e as
 * respostas só aparecessem depois de recarregar à mão, a pessoa que está a
 * olhar para "Por ler" continuava a ver "Por ler" muito depois de o assunto
 * estar resolvido — e o comportamento normal de quem acha que ninguém leu é
 * escrever outra vez.
 *
 * **Só com o separador à vista.** Um intervalo que continua a bater com a
 * página escondida gasta bateria e pedidos para ninguém, e um portátil fechado
 * durante a noite acordava com centenas de chamadas feitas. Ao voltar, atualiza
 * uma vez de imediato — que é o momento em que a pessoa está mesmo a olhar.
 *
 * `router.refresh()` volta a correr o componente de servidor e troca o que
 * mudou, sem mexer no que está escrito nos campos: quem está a meio de uma
 * resposta não a perde por o ecrã se ter atualizado.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AtualizaSozinho({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const intervalo = Math.max(5, segundos) * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const parar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const arrancar = () => {
      parar();
      timer = setInterval(() => router.refresh(), intervalo);
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        // Voltou agora: o que interessa é o estado de agora, não daqui a 20s.
        router.refresh();
        arrancar();
      } else {
        parar();
      }
    };

    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [router, segundos]);

  return null;
}
