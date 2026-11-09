import { SOURCE_LABEL } from "@/lib/fmt";
export function Src({ s, extra }: { s: string; extra?: string }) {
  return <span className="src" data-s={s}><i />{SOURCE_LABEL[s] ?? s}{extra ? ` · ${extra}` : ""}</span>;
}
