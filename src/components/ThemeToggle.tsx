"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "rachar-tema";

/** Cor da barra do browser/PWA em cada tema (tem de casar com --c-bg). */
const THEME_COLOR: Record<Theme, string> = {
  dark: "#08080a",
  light: "#faf8f4",
};

/**
 * Script que corre ANTES de pintar: põe data-theme no <html> a partir do que
 * está guardado. Sem isto, quem escolhe o tema de dia via um flash escuro em
 * cada navegação. Fica inline no <head> de propósito.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"${THEME_COLOR.light}":"${THEME_COLOR.dark}");}}catch(e){}`;

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Modo privado ou storage cheio: o tema vale só para esta visita.
  }
}

/**
 * Alterna entre o tema de noite (predefinido) e o de dia. A escolha fica no
 * browser — é uma preferência do aparelho, não da conta: o mesmo utilizador
 * pode querer noite no telemóvel e dia no portátil.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // O tema real só se sabe no cliente; até lá o botão mostra o predefinido.
  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme | undefined) ?? "dark";
    setTheme(current);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        setTheme(next);
      }}
      className="grid h-9 w-9 place-items-center rounded-full border border-hair text-fg-muted transition-colors hover:border-fg/30 hover:text-fg"
      aria-label={next === "light" ? "Mudar para tema de dia" : "Mudar para tema de noite"}
      title={next === "light" ? "Tema de dia" : "Tema de noite"}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
