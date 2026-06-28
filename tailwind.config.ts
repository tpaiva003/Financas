import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tema escuro editorial. Quase-preto quente + off-white.
        bg: "#08080a",
        panel: "#101012",
        panel2: "#16161a",
        hair: "rgba(255,255,255,0.09)",
        hair2: "rgba(255,255,255,0.06)",
        fg: "#f3f2ee",
        "fg-muted": "#a3a29c",
        "fg-faint": "#6d6c67",
        credit: "#62d196",
        debt: "#f0746f",
        accent: "#f3f2ee",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        soft: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(0,0,0,0.8)",
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 30px 80px -40px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.8s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
