import { Access } from "./Access";
import { Mark, Wordmark } from "@/components/Mark";

export const metadata = { title: "Accesso · Altura" };

export default function Page() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }} className="stack">
        <div className="stack" style={{ gap: 10, alignItems: "flex-start" }}><div className="row" style={{ gap: 12 }}><Mark size={44} /><Wordmark height={30} /></div><p className="muted">Know your edge</p></div>
        <Access />
      </div>
    </main>
  );
}
