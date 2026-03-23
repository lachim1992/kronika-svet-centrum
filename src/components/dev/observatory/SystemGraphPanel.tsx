import { useMemo, useCallback, useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SYSTEM_NODES, SYSTEM_EDGES, STATUS_COLORS, LINK_STYLES, type SystemNode as SysNode, type LinkType } from "./observatoryData";
import { X, Combine, Intersect, RotateCcw } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────

function getNeighbors(nodeId: string, depth: number, allEdges: typeof SYSTEM_EDGES): Set<string> {
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);

  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const e of allEdges) {
        if (e.source === e.target) continue; // skip self-loops
        if (e.source === id && !visited.has(e.target)) { visited.add(e.target); next.add(e.target); }
        if (e.target === id && !visited.has(e.source)) { visited.add(e.source); next.add(e.source); }
      }
    }
    frontier = next;
  }
  return visited;
}

function getVisibleNodes(
  selected: string[],
  depth: number,
  mode: "union" | "intersection",
  edges: typeof SYSTEM_EDGES,
): Set<string> | null {
  if (selected.length === 0) return null; // no filter
  const sets = selected.map(id => getNeighbors(id, depth, edges));
  if (mode === "union") {
    const union = new Set<string>();
    sets.forEach(s => s.forEach(id => union.add(id)));
    return union;
  }
  // intersection
  const [first, ...rest] = sets;
  const inter = new Set<string>();
  for (const id of first) {
    if (rest.every(s => s.has(id))) inter.add(id);
  }
  // always include selected nodes themselves
  selected.forEach(id => inter.add(id));
  return inter;
}

// ─── Custom Node ──────────────────────────────────────────

interface CustomNodeData {
  node: SysNode;
  dimmed: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SystemNodeComponent({ data, id }: NodeProps) {
  const { node, dimmed, isSelected, onSelect } = data as unknown as CustomNodeData;
  const colors = STATUS_COLORS[node.status];

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] max-w-[200px] shadow-lg cursor-pointer transition-all"
      style={{
        background: colors.bg,
        borderColor: isSelected ? "#fff" : colors.border,
        color: colors.text,
        opacity: dimmed ? 0.15 : 1,
        transform: isSelected ? "scale(1.08)" : "scale(1)",
        boxShadow: isSelected ? `0 0 12px ${colors.border}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="font-bold text-xs leading-tight mb-1">{node.label}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
          {node.type.replace(/_/g, " ")}
        </span>
        {node.playerFacing && <span className="text-[9px] px-1 rounded bg-green-900/50">UI</span>}
        {node.usedByAI && <span className="text-[9px] px-1 rounded bg-purple-900/50">AI</span>}
        {node.readOnly && <span className="text-[9px] px-1 rounded bg-gray-700/50">RO</span>}
      </div>
      <div className="text-[9px] leading-tight opacity-80 mb-1">
        {node.upstreamCount} in / {node.downstreamCount} out
      </div>
      {node.gaps.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {node.gaps.map((g) => (
            <span key={g} className="text-[8px] px-1 rounded bg-red-900/60 text-red-200">{g}</span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { systemNode: SystemNodeComponent };

// ─── Layout ───────────────────────────────────────────────

const COLUMNS: Record<string, string[]> = {
  resource: ["grain", "production", "wealth", "capacity", "faith", "iron", "horses"],
  stat: ["population", "stability", "influence", "tension"],
  driver: ["mobilization", "morale", "garrison", "faction_power", "renown", "legitimacy", "prestige"],
  economic: ["node_score", "trade_flow", "labor_allocation", "ration_policy"],
  hidden: ["dev_level", "migration_pressure", "disease_level", "vulnerability"],
  narrative: ["chronicles", "wiki", "rumors", "diplomatic_memory"],
};
const COL_X: Record<string, number> = { resource: 0, stat: 260, driver: 520, economic: 780, hidden: 1040, narrative: 1300 };

function buildPositions(): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [col, ids] of Object.entries(COLUMNS)) {
    ids.forEach((id, i) => { pos[id] = { x: COL_X[col] ?? 0, y: i * 120 }; });
  }
  return pos;
}

const NODE_POSITIONS = buildPositions();

// ─── Panel ────────────────────────────────────────────────

const ALL_LINK_TYPES: LinkType[] = ["causal", "modifier", "threshold", "unlock", "event_driven", "projection"];

const SystemGraphPanel = () => {
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [depth, setDepth] = useState(1);
  const [mode, setMode] = useState<"union" | "intersection">("union");
  const [enabledLinks, setEnabledLinks] = useState<Set<LinkType>>(new Set(ALL_LINK_TYPES));
  const [detailNode, setDetailNode] = useState<SysNode | null>(null);

  const toggleLink = useCallback((lt: LinkType) => {
    setEnabledLinks(prev => {
      const next = new Set(prev);
      next.has(lt) ? next.delete(lt) : next.add(lt);
      return next;
    });
  }, []);

  const handleNodeSelect = useCallback((id: string) => {
    // If clicking again, open detail
    setSelectedNodes(prev => {
      if (prev.includes(id)) {
        // open detail drawer
        const sn = SYSTEM_NODES.find(n => n.id === id);
        if (sn) setDetailNode(sn);
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const removeSelection = useCallback((id: string) => {
    setSelectedNodes(prev => prev.filter(x => x !== id));
  }, []);

  const clearSelection = useCallback(() => setSelectedNodes([]), []);

  // Filter edges by enabled link types
  const filteredEdges = useMemo(
    () => SYSTEM_EDGES.filter(e => enabledLinks.has(e.linkType)),
    [enabledLinks],
  );

  // Compute visible set
  const visibleSet = useMemo(
    () => getVisibleNodes(selectedNodes, depth, mode, filteredEdges),
    [selectedNodes, depth, mode, filteredEdges],
  );

  // Build React Flow nodes
  const nodes: Node[] = useMemo(() => {
    return SYSTEM_NODES.map(sysNode => ({
      id: sysNode.id,
      type: "systemNode",
      position: NODE_POSITIONS[sysNode.id] ?? { x: 0, y: 0 },
      data: {
        node: sysNode,
        dimmed: visibleSet !== null && !visibleSet.has(sysNode.id),
        isSelected: selectedNodes.includes(sysNode.id),
        onSelect: handleNodeSelect,
      },
    }));
  }, [visibleSet, selectedNodes, handleNodeSelect]);

  // Build React Flow edges
  const edges: Edge[] = useMemo(() => {
    return filteredEdges
      .filter(e => e.source !== e.target)
      .map((e, i) => {
        const style = LINK_STYLES[e.linkType];
        const dimmed = visibleSet !== null && (!visibleSet.has(e.source) || !visibleSet.has(e.target));
        return {
          id: `e-${i}`,
          source: e.source,
          target: e.target,
          label: e.label,
          style: {
            stroke: style.stroke,
            strokeDasharray: style.dashArray,
            strokeWidth: 1.5,
            opacity: dimmed ? 0.08 : 1,
          },
          labelStyle: { fontSize: 9, fill: style.stroke, opacity: dimmed ? 0.08 : 1 },
          animated: e.linkType === "causal" && !dimmed,
        };
      });
  }, [filteredEdges, visibleSet]);

  // Detail: incoming/outgoing edges for selected detail node
  const detailEdges = useMemo(() => {
    if (!detailNode) return { incoming: [] as typeof SYSTEM_EDGES, outgoing: [] as typeof SYSTEM_EDGES };
    return {
      incoming: SYSTEM_EDGES.filter(e => e.target === detailNode.id && e.source !== e.target),
      outgoing: SYSTEM_EDGES.filter(e => e.source === detailNode.id && e.source !== e.target),
    };
  }, [detailNode]);

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status legend */}
        {Object.entries(STATUS_COLORS).map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c.border, color: c.border }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} />
            {key}
          </Badge>
        ))}
      </div>

      {/* ── Link type toggles ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] text-muted-foreground font-medium">Link types:</span>
        {ALL_LINK_TYPES.map(lt => (
          <label key={lt} className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={enabledLinks.has(lt)}
              onCheckedChange={() => toggleLink(lt)}
              className="h-3.5 w-3.5"
            />
            <svg width="16" height="6">
              <line x1="0" y1="3" x2="16" y2="3" stroke={LINK_STYLES[lt].stroke} strokeWidth="2" strokeDasharray={LINK_STYLES[lt].dashArray || "0"} />
            </svg>
            <span className="text-[10px]" style={{ color: LINK_STYLES[lt].stroke }}>{LINK_STYLES[lt].label}</span>
          </label>
        ))}
      </div>

      {/* ── Isolation controls ── */}
      <div className="flex flex-wrap items-center gap-3 bg-card/50 border rounded-lg p-2">
        <span className="text-[10px] text-muted-foreground font-medium">Isolation:</span>

        {/* Depth slider */}
        <div className="flex items-center gap-2 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground">Depth</span>
          <Slider
            min={1} max={3} step={1}
            value={[depth]}
            onValueChange={([v]) => setDepth(v)}
            className="w-[80px]"
          />
          <span className="text-[10px] font-mono font-bold">{depth}</span>
        </div>

        {/* Union / Intersection toggle */}
        <Button
          size="sm" variant={mode === "union" ? "default" : "outline"}
          className="h-6 text-[10px] gap-1 px-2"
          onClick={() => setMode("union")}
        >
          <Combine className="h-3 w-3" /> Union
        </Button>
        <Button
          size="sm" variant={mode === "intersection" ? "default" : "outline"}
          className="h-6 text-[10px] gap-1 px-2"
          onClick={() => setMode("intersection")}
        >
          <Intersect className="h-3 w-3" /> Intersect
        </Button>

        {/* Selected chips */}
        {selectedNodes.map(id => {
          const sn = SYSTEM_NODES.find(n => n.id === id);
          return (
            <Badge key={id} className="text-[10px] gap-1 h-5 cursor-pointer" onClick={() => removeSelection(id)}>
              {sn?.label ?? id}
              <X className="h-2.5 w-2.5" />
            </Badge>
          );
        })}

        {selectedNodes.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={clearSelection}>
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        )}

        {selectedNodes.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Klikni na uzel pro izolaci. Dvojklik = detail.</span>
        )}
      </div>

      {/* ── Graph ── */}
      <div className="w-full h-[600px] border rounded-lg bg-background/50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onPaneClick={clearSelection}
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

      {/* ── Detail Drawer ── */}
      <Sheet open={!!detailNode} onOpenChange={(open) => { if (!open) setDetailNode(null); }}>
        <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
          {detailNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[detailNode.status].border }} />
                  {detailNode.label}
                </SheetTitle>
                <SheetDescription>{detailNode.description}</SheetDescription>
              </SheetHeader>

              <ScrollArea className="mt-4 space-y-4 pr-2">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                  <MetaItem label="Typ" value={detailNode.type.replace(/_/g, " ")} />
                  <MetaItem label="Status" value={detailNode.status} />
                  <MetaItem label="Agency" value={detailNode.agency} />
                  <MetaItem label="Player-facing" value={detailNode.playerFacing ? "Ano" : "Ne"} />
                  <MetaItem label="Used by AI" value={detailNode.usedByAI ? "Ano" : "Ne"} />
                  <MetaItem label="Read-only" value={detailNode.readOnly ? "Ano" : "Ne"} />
                </div>

                {/* Scores */}
                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                  <ScoreBar label="Player influence" value={detailNode.playerInfluenceScore} max={10} color="#22c55e" />
                  <ScoreBar label="AI dependency" value={detailNode.aiDependencyScore} max={10} color="#a855f7" />
                  <ScoreBar label="UI surfacing" value={detailNode.uiSurfacingLevel} max={10} color="#3b82f6" />
                </div>

                {/* Formula */}
                {detailNode.formula && (
                  <div className="mb-4">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">Formula</p>
                    <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap font-mono">{detailNode.formula}</pre>
                  </div>
                )}

                {/* Gap badges */}
                {detailNode.gaps.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">Gap Badges</p>
                    <div className="flex flex-wrap gap-1">
                      {detailNode.gaps.map(g => (
                        <Badge key={g} variant="destructive" className="text-[9px]">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Incoming edges */}
                <div className="mb-4">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">
                    Incoming ({detailEdges.incoming.length})
                  </p>
                  {detailEdges.incoming.map((e, i) => (
                    <EdgeRow key={i} from={e.source} label={e.label} linkType={e.linkType} />
                  ))}
                  {detailEdges.incoming.length === 0 && <p className="text-[9px] text-muted-foreground italic">Žádné vstupy</p>}
                </div>

                {/* Outgoing edges */}
                <div className="mb-4">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">
                    Outgoing ({detailEdges.outgoing.length})
                  </p>
                  {detailEdges.outgoing.map((e, i) => (
                    <EdgeRow key={i} from={e.target} label={e.label} linkType={e.linkType} />
                  ))}
                  {detailEdges.outgoing.length === 0 && <p className="text-[9px] text-muted-foreground italic">Žádné výstupy — ⚠️ dead end</p>}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

// ─── Small sub-components ─────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded px-2 py-1">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="text-[11px] font-medium capitalize">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = (value / max) * 100;
  return (
    <div>
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      <div className="h-2 rounded bg-muted/50 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[10px] font-mono text-right">{value}/{max}</p>
    </div>
  );
}

function EdgeRow({ from, label, linkType }: { from: string; label?: string; linkType: LinkType }) {
  const sn = SYSTEM_NODES.find(n => n.id === from);
  const style = LINK_STYLES[linkType];
  return (
    <div className="flex items-center gap-2 text-[10px] py-0.5">
      <svg width="12" height="6">
        <line x1="0" y1="3" x2="12" y2="3" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dashArray || "0"} />
      </svg>
      <span className="font-medium">{sn?.label ?? from}</span>
      {label && <span className="text-muted-foreground">({label})</span>}
      <Badge variant="outline" className="text-[8px] h-3.5 ml-auto" style={{ borderColor: style.stroke, color: style.stroke }}>
        {linkType}
      </Badge>
    </div>
  );
}

export default SystemGraphPanel;
