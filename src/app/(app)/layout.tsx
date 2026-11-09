import { Nav } from "@/components/Nav";
import { SW } from "@/components/SW";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <a href="#contenuto" className="skip">Vai al contenuto</a>
      <Nav />
      <main className="page" id="contenuto">{children}</main>
      <SW />
    </div>
  );
}
