"use client";

import { useEffect, useState } from "react";

/**
 * Convite a instalar a app no telemóvel.
 *
 * Os dois sistemas fazem isto de maneiras opostas, e é por isso que este
 * componente existe em vez de um botão só:
 *
 * - **Android e Chrome** disparam `beforeinstallprompt`. Guarda-se o evento e
 *   mostra-se um botão a sério, que abre o diálogo do sistema.
 * - **iOS não dispara nada.** No Safari, instalar é Partilhar → Adicionar ao
 *   ecrã principal, e não há forma de o pedir por código. A única coisa útil que
 *   se pode fazer é dizer onde carregar, com as palavras que aparecem no ecrã.
 *
 * Desaparece assim que a app está instalada, e quem o dispensa não volta a
 * vê-lo. Um convite que insiste passa a estorvo em dois dias.
 */
const DISMISSED = "rachar-instalar-dispensado";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Já instalada: em pé de app, não há nada a sugerir.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(DISMISSED) === "1") return;

    const ua = window.navigator.userAgent;
    // O iPad moderno diz que é um Mac: distingue-se pelo toque.
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    // No iOS só o Safari instala. Chrome e Firefox no iPhone não conseguem, e
    // mandar lá a pessoa era mandá-la a lado nenhum.
    const safari = !/crios|fxios|edgios/i.test(ua);

    if (ios && safari) {
      setIsIos(true);
      setHidden(false);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED, "1");
    setHidden(true);
  };

  return (
    <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel2 text-fg">
          ↓
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Instala a Rachar no telemóvel</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {isIos ? (
              <>
                No Safari: <span className="text-fg">Partilhar</span> e depois{" "}
                <span className="text-fg">Adicionar ao ecrã principal</span>.
              </>
            ) : (
              "Abre como uma app, sem barra de endereço, e chega-se mais depressa."
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {event ? (
          <button
            type="button"
            onClick={async () => {
              await event.prompt();
              const choice = await event.userChoice;
              if (choice.outcome === "accepted") setHidden(true);
              setEvent(null);
            }}
            className="btn-primary px-4 py-2 text-sm"
          >
            Instalar
          </button>
        ) : null}
        <button type="button" onClick={dismiss} className="btn-ghost px-3 text-xs">
          Agora não
        </button>
      </div>
    </div>
  );
}
