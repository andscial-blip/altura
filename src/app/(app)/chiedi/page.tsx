import { Card, Head } from "@/components/Head";
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
    <div className="stack-l">
      <Head title="Chiedi a Claude" sub="Le domande sui tuoi dati si fanno a Claude, che legge il database di Altura con il connettore Supabase del tuo account." />
      <div className="grid g2">
        <Card title="Come funziona" icon="chat">
          <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Apri una conversazione su claude.ai con il connettore Supabase attivo.</li>
            <li>Copia una domanda qui accanto e incollala.</li>
            <li>Claude interroga solo lo schema <b>sport</b> e risponde citando dati, periodo, fonte, metodo e limiti.</li>
          </ol>
          <p className="note" style={{ marginTop: 12 }}>Nessun dato parte da Altura verso servizi di intelligenza artificiale: è Claude, nel tuo account e su tua richiesta, a leggere il database. Dati sanitari compresi: decidi tu, conversazione per conversazione, cosa chiedere.</p>
        </Card>
        <Card title="Domande pronte" icon="target">
          <div className="stack">{PROMPTS.map((p) => <CopyPrompt key={p} text={p} />)}</div>
          <p className="note" style={{ marginTop: 12 }}>Contesto per Claude: progetto Supabase &quot;cairn&quot;, schema &quot;sport&quot;; tabelle activities, activity_sources, daily_metrics (con metric_catalog per unità e priorità delle fonti), planned_workouts, goals, sync_runs.</p>
        </Card>
      </div>
    </div>
  );
}
