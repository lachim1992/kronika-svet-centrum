import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SYSTEM_NODES } from "./observatoryData";
import { Eye, EyeOff, Brain, AlertTriangle } from "lucide-react";

const HiddenMetricsPanel = () => {
  // Show ALL nodes sorted by UI surfacing level (hidden first)
  const sorted = [...SYSTEM_NODES].sort((a, b) => a.uiSurfacingLevel - b.uiSurfacingLevel);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Anti-illusion panel: ukazuje jak se metriky počítají, kde se používají, a jestli mají downstream efekt.
      </p>

      <div className="border rounded-lg overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[160px]">Metrika</TableHead>
              <TableHead className="text-xs w-[60px]">Typ</TableHead>
              <TableHead className="text-xs">Formule</TableHead>
              <TableHead className="text-xs w-[40px] text-center">UI</TableHead>
              <TableHead className="text-xs w-[40px] text-center">AI</TableHead>
              <TableHead className="text-xs w-[40px] text-center">Out</TableHead>
              <TableHead className="text-xs w-[100px]">Gap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((node) => (
              <TableRow key={node.id} className={node.gaps.length > 0 ? "bg-destructive/5" : ""}>
                <TableCell className="font-mono text-xs font-bold py-1.5">
                  <div className="flex items-center gap-1">
                    {node.uiSurfacingLevel < 3 ? (
                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3 w-3 text-green-500" />
                    )}
                    {node.label}
                  </div>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground py-1.5">
                  {node.type.replace(/_/g, " ").slice(0, 12)}
                </TableCell>
                <TableCell className="text-[10px] font-mono text-muted-foreground py-1.5 max-w-[300px] truncate">
                  {node.formula || "—"}
                </TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] font-bold ${node.uiSurfacingLevel >= 7 ? "text-green-500" : node.uiSurfacingLevel >= 4 ? "text-yellow-500" : "text-red-500"}`}>
                    {node.uiSurfacingLevel}
                  </span>
                </TableCell>
                <TableCell className="text-center py-1.5">
                  {node.usedByAI ? (
                    <Brain className="h-3 w-3 text-purple-400 mx-auto" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center py-1.5">
                  <span className={`text-[10px] font-bold ${node.downstreamCount > 0 ? "text-green-500" : "text-red-500"}`}>
                    {node.downstreamCount}
                  </span>
                </TableCell>
                <TableCell className="py-1.5">
                  {node.gaps.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5">
                      {node.gaps.slice(0, 2).map((g) => (
                        <Badge key={g} variant="destructive" className="text-[8px] h-3.5 px-1 gap-0.5">
                          <AlertTriangle className="h-2 w-2" />
                          {g}
                        </Badge>
                      ))}
                      {node.gaps.length > 2 && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                          +{node.gaps.length - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-green-500">OK</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 pt-2">
        <SummaryCard label="Celkem metrik" value={SYSTEM_NODES.length} color="text-foreground" />
        <SummaryCard label="S gapem" value={SYSTEM_NODES.filter((n) => n.gaps.length > 0).length} color="text-red-500" />
        <SummaryCard label="UI hidden" value={SYSTEM_NODES.filter((n) => n.uiSurfacingLevel < 3).length} color="text-yellow-500" />
        <SummaryCard label="Dead ends" value={SYSTEM_NODES.filter((n) => n.downstreamCount === 0).length} color="text-red-500" />
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

export default HiddenMetricsPanel;
