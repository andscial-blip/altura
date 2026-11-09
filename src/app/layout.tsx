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

// Immagini d'avvio iOS (app installata): al posto dello schermo bianco compare subito il marchio, identico allo splash.
// Generate dallo splash vero (scripts/splash-images.js); una per ogni dimensione di schermo iPhone in verticale.
const SPLASH: [number, number, number][] = [[375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3]];
const startupImage = SPLASH.map(([w, h, r]) => ({ url: `/splash/${w * r}x${h * r}.png`, media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)` }));

export const metadata: Metadata = {
  title: "Altura",
  description: "Sport, salute e performance in un unico posto.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Altura", statusBarStyle: "default", startupImage },
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
