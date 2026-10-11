import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export type Col<T> = [string, (r: T) => React.ReactNode];
export function Grid<T>({ rows, cols, onRow, source, capped, empty = "Žádné řádky (nula, ne chybějící data)." }: { rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; source: string; capped?: { total: number; truncated: boolean }; empty?: string }) {
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(300);
  const sorted = useMemo(() => { if (!sort) return rows; const g = cols[sort.i][1];
    const v = (r: T) => { const x = g(r); const s = typeof x === "string" ? x : String(x ?? ""); const n = parseFloat(s); return Number.isFinite(n) && /^-?[\d.]/.test(s) ? n : s; };
    return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; }); }, [rows, sort, cols]);
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">Zdroj: {source} · {rows.length} řádků{capped?.truncated ? ` (server ořízl z ${capped.total})` : ""}</p>
      {!rows.length ? <p className="text-muted-foreground p-2">{empty}</p> : (
      <div className="overflow-auto max-h-[60vh] border rounded">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card"><tr>{cols.map(([h], i) => <th key={h} className="px-2 py-1 text-left font-semibold whitespace-nowrap cursor-pointer" onClick={() => setSort({ i, dir: sort?.i === i && sort.dir === 1 ? -1 : 1 })}>{h}{sort?.i === i ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
          <tbody>{sorted.slice(0, limit).map((r, ri) => <tr key={ri} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onRow?.(r)}>{cols.map(([h, g]) => <td key={h} className="px-2 py-0.5 whitespace-nowrap tabular-nums">{g(r)}</td>)}</tr>)}</tbody>
        </table>
        {sorted.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 300)}>Zobrazit dalších ({sorted.length - limit})</Button>}
      </div>)}
    </div>
  );
}

