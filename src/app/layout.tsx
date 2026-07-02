import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

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

export const metadata: Metadata = {
  title: "Rachar · Contas à Moda do Porto",
  description: "Rachar — dividir contas partilhadas sem dramas. Nascido no Porto.",
  manifest: "/manifest.webmanifest",
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
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
