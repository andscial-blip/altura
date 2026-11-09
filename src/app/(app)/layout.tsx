import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Nav />
      <main className="page" id="contenuto">{children}</main>
    </div>
  );
}
