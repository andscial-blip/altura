import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Splash } from "@/components/Splash";

// Instrument Sans (SIL Open Font License), servito dall'app stessa: nessuna richiesta a Google.
const sans = localFont({
  src: [{ path: "../fonts/InstrumentSans-latin.woff2", weight: "400 700", style: "normal" }, { path: "../fonts/InstrumentSans-latin-ext.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-sans", display: "swap",
});

export const metadata: Metadata = {
  title: "Altura",
  description: "Sport, salute e performance in un unico posto.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Altura", statusBarStyle: "default" },
  robots: { index: false, follow: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ECEEF3" }, { media: "(prefers-color-scheme: dark)", color: "#15161D" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={sans.variable}>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
