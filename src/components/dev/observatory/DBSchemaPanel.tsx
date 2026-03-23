import { useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
  Handle,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DB_TABLES, DB_RELATIONS, CATEGORY_COLORS, DB_TABLE_COLUMNS, type DBTable } from "./dbSchemaData";
import { ArrowRight, ArrowLeft, Key, Table2 } from "lucide-react";

function TableNodeComponent({ data, id }: NodeProps) {
  const table = data.table as DBTable;
  const onSelect = data.onSelect as (name: string) => void;
  const colors = CATEGORY_COLORS[table.category];
  const incomingCount = DB_RELATIONS.filter(r => r.to === table.name).length;
  const outgoingCount = DB_RELATIONS.filter(r => r.from === table.name).length;
  const cols = DB_TABLE_COLUMNS[table.name] || [];

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(table.name); }}
      className="rounded-lg border-2 px-3 py-2 min-w-[160px] max-w-[220px] shadow-lg cursor-pointer hover:scale-105 transition-transform"
      style={{ background: colors.bg, borderColor: colors.border, color: "#f3f4f6" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="font-bold text-[11px] leading-tight mb-1 font-mono">{table.name}</div>
      <div className="text-[9px] opacity-80 mb-1">{table.description}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
          {table.category}
        </span>
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
          {cols.length} cols
        </span>
      </div>
      <div className="text-[9px] opacity-70">
        {incomingCount} FK in / {outgoingCount} FK out
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { tableNode: TableNodeComponent };

function layoutSchema(onSelect: (name: string) => void): { nodes: Node[]; edges: Edge[] } {
  const categories = ["core", "spatial", "economy", "military", "social", "narrative", "league", "meta"] as const;
  const colPositions: Record<string, number> = {};
  categories.forEach((c, i) => { colPositions[c] = i * 260; });

  const catCounters: Record<string, number> = {};
  const nodes: Node[] = DB_TABLES.map((table) => {
    const col = table.category;
    const idx = catCounters[col] ?? 0;
    catCounters[col] = idx + 1;
    return {
      id: table.name,
      type: "tableNode",
      position: { x: colPositions[col] ?? 0, y: idx * 110 },
      data: { table, onSelect },
    };
  });

  const edges: Edge[] = DB_RELATIONS.map((rel, i) => ({
    id: `rel-${i}`,
    source: rel.from,
    target: rel.to,
    label: rel.fromCol,
    style: { stroke: "#6b7280", strokeWidth: 1 },
    labelStyle: { fontSize: 8, fill: "#9ca3af" },
  }));

  return { nodes, edges };
}

const DBSchemaPanel = () => {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const handleSelect = useCallback((name: string) => setSelectedTable(name), []);

  const { nodes, edges } = useMemo(() => layoutSchema(handleSelect), [handleSelect]);

  const table = selectedTable ? DB_TABLES.find(t => t.name === selectedTable) : null;
  const columns = selectedTable ? (DB_TABLE_COLUMNS[selectedTable] || []) : [];
  const incomingFKs = selectedTable ? DB_RELATIONS.filter(r => r.to === selectedTable) : [];
  const outgoingFKs = selectedTable ? DB_RELATIONS.filter(r => r.from === selectedTable) : [];

  // Identify which columns are FK columns for this table
  const fkColSet = new Set(outgoingFKs.map(r => r.fromCol));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Plná mapa DB schématu — {DB_TABLES.length} tabulek. Klikni na tabulku pro detail všech sloupců a FK vazeb.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {Object.entries(CATEGORY_COLORS).map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c.border, color: c.border }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} />
            {key} ({DB_TABLES.filter(t => t.category === key).length})
          </Badge>
        ))}
      </div>

      <div className="w-full h-[650px] border rounded-lg bg-background/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              const t = DB_TABLES.find(t => t.name === n.id);
              return t ? CATEGORY_COLORS[t.category].border : "#666";
            }}
          />
        </ReactFlow>
      </div>

      {/* ── Detail Sheet ── */}
      <Sheet open={!!selectedTable} onOpenChange={(open) => { if (!open) setSelectedTable(null); }}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
          {table && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  <Table2 className="h-4 w-4" style={{ color: CATEGORY_COLORS[table.category].border }} />
                  {table.name}
                </SheetTitle>
                <SheetDescription>{table.description}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Meta */}
                <div className="flex flex-wrap gap-2">
                  <Badge style={{ background: CATEGORY_COLORS[table.category].bg, borderColor: CATEGORY_COLORS[table.category].border, color: "#f3f4f6" }}>
                    {table.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{columns.length} columns</Badge>
                  <Badge variant="outline" className="text-[10px]">{table.hasRLS ? "✅ RLS" : "⚠️ No RLS"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{incomingFKs.length} FK in</Badge>
                  <Badge variant="outline" className="text-[10px]">{outgoingFKs.length} FK out</Badge>
                </div>

                {/* Outgoing FK relations */}
                {outgoingFKs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> References (FK out)
                    </p>
                    {outgoingFKs.map((fk, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedTable(fk.to)}
                      >
                        <Key className="h-3 w-3 text-yellow-500 shrink-0" />
                        <span className="font-mono font-medium">{fk.fromCol}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-primary">{fk.to}</span>
                        <span className="text-muted-foreground">.{fk.toCol}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Incoming FK relations */}
                {incomingFKs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <ArrowLeft className="h-3 w-3" /> Referenced by (FK in)
                    </p>
                    {incomingFKs.map((fk, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedTable(fk.from)}
                      >
                        <Key className="h-3 w-3 text-blue-500 shrink-0" />
                        <span className="font-mono text-primary">{fk.from}</span>
                        <span className="text-muted-foreground">.{fk.fromCol}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono font-medium">{table.name}.{fk.toCol}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* All columns */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">
                    Všechny sloupce ({columns.length})
                  </p>
                  <ScrollArea className="h-[350px] border rounded-lg">
                    <div className="p-1">
                      {columns.map(col => {
                        const isFK = fkColSet.has(col);
                        const isPK = col === "id";
                        return (
                          <div
                            key={col}
                            className={`flex items-center gap-2 text-[10px] py-1 px-2 rounded ${
                              isFK ? "bg-yellow-500/10" : isPK ? "bg-blue-500/10" : "hover:bg-muted/20"
                            }`}
                          >
                            {isPK && <Key className="h-3 w-3 text-blue-400 shrink-0" />}
                            {isFK && !isPK && <Key className="h-3 w-3 text-yellow-500 shrink-0" />}
                            {!isPK && !isFK && <span className="w-3 shrink-0" />}
                            <span className={`font-mono ${isPK ? "font-bold text-blue-400" : isFK ? "font-medium text-yellow-400" : ""}`}>
                              {col}
                            </span>
                            {isPK && <Badge variant="outline" className="text-[8px] h-3.5 ml-auto">PK</Badge>}
                            {isFK && (
                              <Badge variant="outline" className="text-[8px] h-3.5 ml-auto text-yellow-500 border-yellow-500/50">
                                FK → {outgoingFKs.find(f => f.fromCol === col)?.to}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Key columns highlight */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Key columns (z definice)</p>
                  <div className="flex flex-wrap gap-1">
                    {table.keyColumns.map(kc => (
                      <Badge key={kc} variant="secondary" className="text-[9px] font-mono">{kc}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default DBSchemaPanel;
