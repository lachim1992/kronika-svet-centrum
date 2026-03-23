import { useMemo, useCallback } from "react";
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
import { SYSTEM_NODES, SYSTEM_EDGES, STATUS_COLORS, LINK_STYLES, type SystemNode as SysNode } from "./observatoryData";

// ─── Custom Node ──────────────────────────────────────────

function SystemNodeComponent({ data }: NodeProps) {
  const node = data.node as SysNode;
  const colors = STATUS_COLORS[node.status];

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] max-w-[200px] shadow-lg"
      style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="font-bold text-xs leading-tight mb-1">{node.label}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
          {node.type.replace(/_/g, " ")}
        </span>
        {node.playerFacing && (
          <span className="text-[9px] px-1 rounded bg-green-900/50">UI</span>
        )}
        {node.usedByAI && (
          <span className="text-[9px] px-1 rounded bg-purple-900/50">AI</span>
        )}
        {node.readOnly && (
          <span className="text-[9px] px-1 rounded bg-gray-700/50">RO</span>
        )}
      </div>
      <div className="text-[9px] leading-tight opacity-80 mb-1">
        {node.upstreamCount} in / {node.downstreamCount} out
      </div>
      {node.gaps.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {node.gaps.map((g) => (
            <span key={g} className="text-[8px] px-1 rounded bg-red-900/60 text-red-200">
              {g}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { systemNode: SystemNodeComponent };

// ─── Layout helper ────────────────────────────────────────

function layoutNodes(): Node[] {
  // Arrange by type in columns
  const columns: Record<string, string[]> = {
    resource: ["grain", "production", "wealth", "capacity", "faith", "iron", "horses"],
    stat: ["population", "stability", "influence", "tension"],
    driver: ["mobilization", "morale", "garrison", "faction_power", "renown", "legitimacy", "prestige"],
    economic: ["node_score", "trade_flow", "labor_allocation", "ration_policy"],
    hidden: ["dev_level", "migration_pressure", "disease_level", "vulnerability"],
    narrative: ["chronicles", "wiki", "rumors", "diplomatic_memory"],
  };

  const colPositions: Record<string, number> = {
    resource: 0, stat: 260, driver: 520, economic: 780, hidden: 1040, narrative: 1300,
  };

  const nodes: Node[] = [];

  for (const [col, ids] of Object.entries(columns)) {
    const x = colPositions[col] ?? 0;
    ids.forEach((id, i) => {
      const sysNode = SYSTEM_NODES.find((n) => n.id === id);
      if (!sysNode) return;
      nodes.push({
        id,
        type: "systemNode",
        position: { x, y: i * 120 },
        data: { node: sysNode },
      });
    });
  }

  return nodes;
}

function layoutEdges(): Edge[] {
  return SYSTEM_EDGES.filter((e) => e.source !== e.target).map((e, i) => {
    const style = LINK_STYLES[e.linkType];
    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      style: {
        stroke: style.stroke,
        strokeDasharray: style.dashArray,
        strokeWidth: 1.5,
      },
      labelStyle: { fontSize: 9, fill: style.stroke },
      animated: e.linkType === "causal",
    };
  });
}

// ─── Panel ────────────────────────────────────────────────

const SystemGraphPanel = () => {
  const nodes = useMemo(() => layoutNodes(), []);
  const edges = useMemo(() => layoutEdges(), []);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_COLORS).map(([key, c]) => (
          <Badge
            key={key}
            variant="outline"
            className="text-[10px] gap-1"
            style={{ borderColor: c.border, color: c.border }}
          >
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} />
            {key}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {Object.entries(LINK_STYLES).map(([key, s]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: s.stroke, color: s.stroke }}>
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={s.stroke} strokeWidth="2" strokeDasharray={s.dashArray || "0"} /></svg>
            {s.label}
          </Badge>
        ))}
      </div>

      {/* Graph */}
      <div className="w-full h-[600px] border rounded-lg bg-background/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              const sysNode = SYSTEM_NODES.find((s) => s.id === n.id);
              return sysNode ? STATUS_COLORS[sysNode.status].border : "#666";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export default SystemGraphPanel;
