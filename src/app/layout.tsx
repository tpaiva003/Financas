import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/** Domínio de produção. Serve de base a todos os URLs absolutos. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rachar.pt";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Rachar · Contas à Moda do Porto",
  description:
    "Rachar, as contas partilhadas e o património no mesmo sítio: dividir despesas, importar extratos, rendimentos, investimentos e FIRE. Nascido no Porto.",
  manifest: "/manifest.webmanifest",
  // O iOS ignora os ícones do manifest: usa o apple-touch-icon, e só em PNG.
  // Sem ele, "Adicionar ao ecrã principal" mete uma miniatura da página em vez
  // da marca, que é a diferença entre parecer uma app e parecer um atalho.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rachar",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        {/* Aplica o tema guardado antes de pintar (evita flash ao mudar de página). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
