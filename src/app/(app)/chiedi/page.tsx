import { Head } from "@/components/Head";
import { CopyPrompt } from "./CopyPrompt";

export const metadata = { title: "Chiedi a Claude · Altura" };

const PROMPTS = [
  "Com'è andata la mia ultima settimana di allenamento rispetto alle 4 precedenti? Cita i numeri, il periodo e la fonte di ogni dato.",
  "Il mio recupero (variabilità cardiaca notturna, battito a riposo, sonno) degli ultimi 14 giorni è in linea con la mia fascia abituale? Indica metodo e limiti.",
  "Sto rispettando il piano Runna? Elenca le sedute saltate o spostate nelle ultime 4 settimane.",
  "La mia efficienza nella corsa (velocità per battito) sta migliorando negli ultimi 3 mesi? Distingui corse facili e qualità.",
];

export default function Page() {
  return (
    <div className="stack">
      <Head title="Chiedi a Claude" sub={<>Le domande sui tuoi dati si fanno a Claude, che legge il database di Altura con il connettore Supabase già collegato al tuo account.</>} tools={false} />
      <section className="panel stack">
        <h2>Come funziona</h2>
        <p>Apri una conversazione su claude.ai con il connettore Supabase attivo e incolla una delle domande qui sotto. Claude interroga solo lo schema <b>sport</b> del progetto e risponde citando dati, periodo, fonte, metodo e limiti.</p>
        <p className="note">Nessun dato parte da Altura verso servizi di intelligenza artificiale: è Claude, nel tuo account e su tua richiesta, a leggere il database. Dati sanitari compresi: decidi tu, conversazione per conversazione, cosa chiedere.</p>
      </section>
      <section className="panel stack">
        <h2>Domande pronte</h2>
        {PROMPTS.map((p) => <CopyPrompt key={p} text={p} />)}
        <p className="note">Contesto da dare a Claude se serve: progetto Supabase &quot;cairn&quot;, schema &quot;sport&quot;; tabelle activities, activity_sources, daily_metrics (con metric_catalog per unità e gerarchia delle fonti), planned_workouts, goals, sync_runs.</p>
      </section>
    </div>
  );
}
