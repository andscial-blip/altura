import { saveCheckin } from "@/app/(app)/actions";
import { CONTEXT_LABEL, type Context } from "@/lib/readiness";

const FEEL = [{ v: 1, t: "Molto stanco" }, { v: 2, t: "Stanco" }, { v: 3, t: "Normale" }, { v: 4, t: "Bene" }, { v: 5, t: "Benissimo" }];

/**
 * Domanda del mattino: un tocco su 1-5. Il contesto (caldo, viaggio...) si sceglie prima di toccare il numero,
 * oppure si aggiorna dopo con "Salva il contesto". Funziona senza JavaScript (moduli e server action).
 */
export function CheckIn({ feel, context, available }: { feel: number | null; context: Context[]; available: boolean }) {
  if (!available) return null;
  return (
    <form action={saveCheckin} className="checkin" aria-label="Come ti senti stamattina">
      <p className="ck-q">{feel ? <>Stamattina: <b>{FEEL[feel - 1].t.toLowerCase()}</b> ({feel}/5). Puoi cambiarlo.</> : "Come ti senti stamattina?"}</p>
      <div className="ck-feel" role="group" aria-label="Da 1 (molto stanco) a 5 (benissimo)">
        {FEEL.map((f) => <button key={f.v} type="submit" name="feel" value={f.v} aria-pressed={feel === f.v} title={f.t}><b>{f.v}</b><span>{f.t}</span></button>)}
      </div>
      <fieldset className="ck-ctx">
        <legend>Contesto di oggi</legend>
        {(Object.keys(CONTEXT_LABEL) as Context[]).map((c) => (
          <label key={c}><input type="checkbox" name="ctx" value={c} defaultChecked={context.includes(c)} /><span>{CONTEXT_LABEL[c]}</span></label>
        ))}
        {feel && <button type="submit" name="keep" value="1" className="btn sm">Salva il contesto</button>}
      </fieldset>
    </form>
  );
}
