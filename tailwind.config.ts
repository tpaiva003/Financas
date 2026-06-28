import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9e9ff",
          200: "#bcd8ff",
          300: "#8ebfff",
          400: "#599bff",
          500: "#3377f6",
          600: "#1f59db",
          700: "#1a47b1",
          800: "#1b3e8c",
          900: "#1c376f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
