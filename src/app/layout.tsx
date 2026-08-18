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
  // O que as partilhas e os motores de busca mostram. O `og:image` vem do
  // `opengraph-image.tsx` ao lado, gerado no build — não é preciso listá-lo.
  openGraph: {
    type: "website",
    siteName: "Rachar",
    locale: "pt_PT",
    url: "/",
    title: "Rachar · Contas à Moda do Porto",
    description:
      "Divide as contas da casa, importa extratos, acompanha o património e sabe em que ano trabalhar passa a ser opcional. Privado, sem anúncios, nascido no Porto.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rachar · Contas à Moda do Porto",
    description:
      "Divide as contas da casa, importa extratos, acompanha o património e sabe em que ano trabalhar passa a ser opcional.",
  },
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
  // Sem regra global de robots: houve uma, a dizer "não indexar", e escondia o
  // site INTEIRO dos motores de busca — landing incluída. O que é privado
  // esconde-se no layout do grupo `(app)` e nas páginas de token; o resto é
  // para ser encontrado. O teste em `seo.test.ts` guarda isto.
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
