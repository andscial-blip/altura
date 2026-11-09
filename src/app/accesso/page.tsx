import { Access } from "./Access";
import { Mark, Wordmark } from "@/components/Mark";

export const metadata = { title: "Accesso · Altura" };

export default function Page() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))" }}>
      <div style={{ width: "100%", maxWidth: 380 }} className="stack">
        <div className="stack" style={{ gap: 10, alignItems: "flex-start" }}><div className="row" style={{ gap: 12 }}><Mark size={44} /><Wordmark height={30} /></div><p style={{ color: "var(--accent)" }}>Know your edge</p></div>
        <h1 className="sr">Accesso ad Altura</h1>
        <Access />
      </div>
    </main>
  );
}
