import { useMemo } from "react";
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
import { DB_TABLES, DB_RELATIONS, CATEGORY_COLORS, type DBTable } from "./dbSchemaData";

function TableNodeComponent({ data }: NodeProps) {
  const table = data.table as DBTable;
  const colors = CATEGORY_COLORS[table.category];
  const incomingCount = DB_RELATIONS.filter(r => r.to === table.name).length;
  const outgoingCount = DB_RELATIONS.filter(r => r.from === table.name).length;

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[160px] max-w-[220px] shadow-lg"
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
          {table.columnCount} cols
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

function layoutSchema(): { nodes: Node[]; edges: Edge[] } {
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
      data: { table },
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
  const { nodes, edges } = useMemo(() => layoutSchema(), []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Plná mapa DB schématu — {DB_TABLES.length} tabulek, {DB_RELATIONS.length} FK vazeb.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        {Object.entries(CATEGORY_COLORS).map(([key, c]) => (
          <Badge
            key={key}
            variant="outline"
            className="text-[10px] gap-1"
            style={{ borderColor: c.border, color: c.border }}
          >
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
              const table = DB_TABLES.find(t => t.name === n.id);
              return table ? CATEGORY_COLORS[table.category].border : "#666";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export default DBSchemaPanel;
