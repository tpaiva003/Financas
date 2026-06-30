"use client";

import { useEffect } from "react";

/** Regista o service worker para a PWA (instalável em Android/iOS). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Só em produção para não atrapalhar o HMR em dev.
    if (process.env.NODE_ENV !== "production") return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* falha silenciosa — a app continua a funcionar sem offline */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
