import { Access } from "./Access";
import { Mark } from "@/components/Mark";

export const metadata = { title: "Accesso · Altura" };

export default function Page() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }} className="stack">
        <div className="row" style={{ gap: 12 }}><Mark size={40} /><div><h1>Altura</h1><p className="muted">Know your edge</p></div></div>
        <Access />
      </div>
    </main>
  );
}
