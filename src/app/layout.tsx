import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Splash } from "@/components/Splash";

// IBM Plex Sans (variabile) e IBM Plex Mono (SIL Open Font License), serviti dall'app stessa: nessuna richiesta a Google.
const sans = localFont({
  src: [{ path: "../fonts/IBMPlexSans-latin.woff2", weight: "100 700", style: "normal" }, { path: "../fonts/IBMPlexSans-latin-ext.woff2", weight: "100 700", style: "normal" }],
  variable: "--font-sans", display: "swap",
});
const mono = localFont({
  src: [{ path: "../fonts/IBMPlexMono-500-latin.woff2", weight: "500", style: "normal" }, { path: "../fonts/IBMPlexMono-500-latin-ext.woff2", weight: "500", style: "normal" }],
  variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "Altura",
  description: "Sport, salute e performance in un unico posto.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Altura", statusBarStyle: "default" },
  robots: { index: false, follow: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5F7F9" }, { media: "(prefers-color-scheme: dark)", color: "#18202D" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
