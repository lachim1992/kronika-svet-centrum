import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATA_FLOW_AUDIT, getAuditSummary } from "./dataFlowAuditData";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const DataFlowAuditPanel = () => {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [showOnlyDead, setShowOnlyDead] = useState(false);
  const summary = getAuditSummary();

  const tables = [...new Set(DATA_FLOW_AUDIT.map(e => e.table))];
  const filtered = DATA_FLOW_AUDIT
    .filter(e => tableFilter === "all" || e.table === tableFilter)
    .filter(e => !showOnlyDead || !e.liveUsed);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Audit kdo zapisuje a čte každý klíčový DB sloupec. Odhaluje slepá místa kde data končí.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-2">
        <SummaryCard label="Celkem sledováno" value={summary.total} color="text-foreground" />
        <SummaryCard label="Dead columns" value={summary.deadColumns.length} color="text-red-500" />
        <SummaryCard label="Žádný čtenář" value={summary.noReaders.length} color="text-red-500" />
        <SummaryCard label="UI-only display" value={summary.uiOnly.length} color="text-yellow-500" />
        <SummaryCard label="Fake mechaniky" value={summary.fakeColumns.length} color="text-destructive" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Filtr tabulky" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny tabulky</SelectItem>
            {tables.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyDead}
            onChange={(e) => setShowOnlyDead(e.target.checked)}
            className="rounded"
          />
          Jen mrtvé sloupce
        </label>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[450px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[120px]">Tabulka</TableHead>
              <TableHead className="text-xs w-[140px]">Sloupec</TableHead>
              <TableHead className="text-xs">Writers</TableHead>
              <TableHead className="text-xs">Readers</TableHead>
              <TableHead className="text-xs w-[50px] text-center">Live?</TableHead>
              <TableHead className="text-xs">Poznámka</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry, i) => (
              <TableRow key={`${entry.table}-${entry.column}-${i}`} className={!entry.liveUsed ? "bg-destructive/5" : ""}>
                <TableCell className="font-mono text-[10px] py-1.5">{entry.table}</TableCell>
                <TableCell className="font-mono text-[10px] font-bold py-1.5">{entry.column}</TableCell>
                <TableCell className="py-1.5">
                  <div className="flex flex-wrap gap-0.5">
                    {entry.writers.map(w => (
                      <Badge key={w} variant="outline" className="text-[8px] h-4 px-1">{w}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex flex-wrap gap-0.5">
                    {entry.readers.length === 0 ? (
                      <Badge variant="destructive" className="text-[8px] h-4 px-1 gap-0.5">
                        <XCircle className="h-2 w-2" /> NIKDO
                      </Badge>
                    ) : (
                      entry.readers.map(r => (
                        <Badge key={r} variant="secondary" className="text-[8px] h-4 px-1">{r}</Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center py-1.5">
                  {entry.liveUsed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                  )}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground py-1.5 max-w-[200px]">
                  {entry.notes && (
                    <span className={entry.notes.includes("⚠️") ? "text-yellow-500" : ""}>
                      {entry.notes}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 rounded bg-card border">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default DataFlowAuditPanel;
