import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { compare, icsEvents, parseEvent, parseStructure, type IcsEvent } from "@/lib/runna-parse";

const ICS = [
  "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:abc123@runna.com", "DTSTART;VALUE=DATE:20261110",
  "SUMMARY:🏃 Ripetute in salita - 8 km", "DESCRIPTION:Ripetute in salita - 8 km - 45m - 55m\\n2 km riscaldamento\\n6 ripeti",
  " zioni di:\\n• 90 sta intensamente in salita\\n• Camminata di riposo di 90 s\\n2 km raffreddamento\\n📲 Runna plan_week_3_HILLS_2",
  "LAST-MODIFIED:20261101T101500Z", "END:VEVENT", "END:VCALENDAR",
].join("\r\n");

describe("feed iCal Runna", () => {
  it("righe piegate, escape, data intera", () => {
    const ev = icsEvents(ICS);
    expect(ev).toHaveLength(1);
    expect(ev[0].id).toBe("abc123");
    expect(ev[0].start).toEqual({ date: "2026-11-10" });
    expect(ev[0].description).toContain("6 ripetizioni di:");
  });
  it("seduta programmata con chiave stabile e struttura espansa", () => {
    const [k, p] = parseEvent(icsEvents(ICS)[0]);
    expect(k).toBe("planned");
    if (k !== "planned") return;
    expect(p.key).toBe("w3_HILLS_2");
    expect(p.km).toBe(8);
    expect(p.type).toBe("qualita");
    expect(p.dur_min_s).toBe(2700);
    expect(p.steps.filter((s) => s.kind === "work")).toHaveLength(6);
    expect(p.steps.filter((s) => s.kind === "rest")).toHaveLength(6);
  });
  it("blocco 'Ripeti i seguenti passaggi'", () => {
    const st = parseStructure("1 km riscaldamento\nRipeti i seguenti passaggi 3x\n---\n400 m a 4:10/km (4:05 - 4:15/km)\n200 m a 6:00/km\n---\n1 km raffreddamento");
    expect(st.map((s) => s.kind)).toEqual(["warm", "work", "float", "work", "float", "work", "float", "cool"]);
  });
});

// Parità con la versione Python (runna_cal.py) sugli eventi reali del calendario: file privato, non nel repository.
const P = "tests/private/runna_parity.json";
describe.skipIf(!existsSync(P))("parità con runna_cal.py su eventi reali", () => {
  const d = existsSync(P) ? (JSON.parse(readFileSync(P, "utf8")) as { events: IcsEvent[]; parsed: [string | null, unknown][]; compare: unknown[] }) : { events: [], parsed: [], compare: [] };
  it("parse_event identico", () => {
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => (v === undefined ? null : v)));
    d.events.forEach((e, i) => {
      const [k, v] = parseEvent(e);
      expect(k).toBe(d.parsed[i][0]);
      if (k) expect(strip(v)).toEqual(strip(d.parsed[i][1]));
    });
  });
  it("compare identico", () => {
    const done = d.events.map((e) => parseEvent(e)).filter(([k]) => k === "completed") as unknown as ["completed", { steps: never; segments: never; km: number; time_s: number }][];
    done.forEach(([, c], i) => {
      const r = compare(c.steps, c.segments, 12.0, null, c.km, c.time_s);
      expect(JSON.parse(JSON.stringify(r))).toEqual(d.compare[i]);
    });
  });
});

import { linkPlanned, localDate, zonedToUtc } from "@/lib/runna";
describe("abbinamenti Runna", () => {
  it("fusi orari", () => {
    expect(zonedToUtc("2026-11-03T05:30:00", "Indian/Antananarivo")).toBe("2026-11-03T02:30:00.000Z");
    expect(zonedToUtc("2026-07-01T07:00:00", "Europe/Rome")).toBe("2026-07-01T05:00:00.000Z");
    expect(localDate("2026-11-02T22:30:00Z", "Indian/Antananarivo")).toBe("2026-11-03");
  });
  it("stesso titolo vince su stesso tipo; oltre un giorno niente abbinamento", () => {
    const pl = [
      { key: "a", day: "2026-11-03", title: "Corsa facile", type: "facile", taken: false },
      { key: "b", day: "2026-11-04", title: "Ripetute 6x800", type: "qualita", taken: false },
    ];
    expect(linkPlanned({ date: "2026-11-04", title: "Corsa facile - 8 km", type: "facile" }, pl)).toBe("a");
    expect(linkPlanned({ date: "2026-11-04", title: "Fartlek", type: "qualita" }, pl)).toBe("b");
    expect(linkPlanned({ date: "2026-11-07", title: "Corsa facile", type: "facile" }, pl)).toBeNull();
  });
});
