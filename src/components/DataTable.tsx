"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export type Col = { key: string; label: string; r?: boolean; sort?: boolean; lead?: boolean };
export type Cell = { t: string; v?: number | string | null; sub?: string; cls?: string; href?: string };
export type Row = { key: string; hl?: boolean; cells: Record<string, Cell> };

/**
 * Tabella ordinabile: clic sull'intestazione (o menu "Ordina" su telefono). Sotto i 600 px ogni riga diventa una scheda
 * con la colonna principale in alto e le altre etichettate: niente scorrimento orizzontale.
 */
export function DataTable({ cols, rows, caption, initial, pinned = true }: { cols: Col[]; rows: Row[]; caption: string; initial?: { key: string; dir: "asc" | "desc" }; pinned?: boolean }) {
  const [sort, setSort] = useState(initial ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const top = pinned ? rows.filter((r) => r.hl) : [];
    const rest = pinned ? rows.filter((r) => !r.hl) : [...rows];
    const val = (r: Row) => r.cells[sort.key]?.v ?? r.cells[sort.key]?.t ?? null;
    rest.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null || x === "") return 1; if (y === null || y === "") return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it");
      return sort.dir === "asc" ? c : -c;
    });
    return [...top, ...rest];
  }, [rows, sort, pinned]);
  const sortable = cols.filter((c) => c.sort);
  const toggle = (k: string) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  return (
    <div>
      {sortable.length > 0 && (
        <label className="sortbar">Ordina per
          <select value={sort ? `${sort.key}:${sort.dir}` : ""} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort(key ? { key, dir: dir as "asc" | "desc" } : null); }}>
            <option value="">ordine iniziale</option>
            {sortable.flatMap((c) => [<option key={c.key + "d"} value={`${c.key}:desc`}>{c.label} ↓</option>, <option key={c.key + "a"} value={`${c.key}:asc`}>{c.label} ↑</option>])}
          </select>
        </label>
      )}
      <table className="t cards">
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>{cols.map((c) => (
            <th key={c.key} scope="col" className={c.r ? "r" : undefined} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              {c.sort ? <button type="button" onClick={() => toggle(c.key)}>{c.label}{sort?.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</button> : c.label}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className={r.hl ? "hl" : undefined}>
              {cols.map((c) => {
                const x = r.cells[c.key];
                const body = x ? (x.href ? <Link href={x.href}>{x.t}</Link> : x.t) : "–";
                return (
                  <td key={c.key} data-label={c.label} className={[c.lead ? "lead" : "", c.r ? "r mono" : "", x?.cls ?? ""].join(" ").trim() || undefined}>
                    {body}{x?.sub && <span className="sub">{x.sub}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
