/** Date in formato YYYY-MM-DD (giorno locale), senza fusi: aritmetica a mezzogiorno UTC. */
export const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const monday = (d: string) => addDays(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
export const range = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
