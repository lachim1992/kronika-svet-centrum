import { useMemo, useCallback, useState, useEffect } from "react";
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
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  SYSTEM_NODES, SYSTEM_EDGES, STATUS_COLORS, LINK_STYLES, LAYER_META,
  type SystemNode as SysNode, type LinkType, type SystemLayer,
} from "./observatoryData";
import { X, Combine, Merge, RotateCcw, Layers, Database } from "lucide-react";

// ─── Force-directed layout ────────────────────────────────

function forceDirectedLayout(
  nodeIds: string[],
  edges: typeof SYSTEM_EDGES,
  width = 1600,
  height = 1000,
  iterations = 120,
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const N = nodeIds.length;
  if (N === 0) return pos;

  // Initialize in a circle
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / N;
    pos[id] = {
      x: width / 2 + (width * 0.35) * Math.cos(angle),
      y: height / 2 + (height * 0.35) * Math.sin(angle),
    };
  });

  const idSet = new Set(nodeIds);
  const relevantEdges = edges.filter(e => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target);

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 0.1 * (1 - iter / iterations);
    const forces: Record<string, { fx: number; fy: number }> = {};
    nodeIds.forEach(id => { forces[id] = { fx: 0, fy: 0 }; });

    // Repulsion
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodeIds[i], b = nodeIds[j];
        const dx = pos[a].x - pos[b].x;
        const dy = pos[a].y - pos[b].y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const repulse = 50000 / (dist * dist);
        const fx = (dx / dist) * repulse;
        const fy = (dy / dist) * repulse;
        forces[a].fx += fx; forces[a].fy += fy;
        forces[b].fx -= fx; forces[b].fy -= fy;
      }
    }

    // Attraction
    for (const e of relevantEdges) {
      const dx = pos[e.target].x - pos[e.source].x;
      const dy = pos[e.target].y - pos[e.source].y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const attract = dist * 0.005;
      const fx = (dx / dist) * attract;
      const fy = (dy / dist) * attract;
      forces[e.source].fx += fx; forces[e.source].fy += fy;
      forces[e.target].fx -= fx; forces[e.target].fy -= fy;
    }

    // Apply
    for (const id of nodeIds) {
      const f = forces[id];
      const mag = Math.sqrt(f.fx * f.fx + f.fy * f.fy);
      if (mag > 0) {
        const maxDisp = Math.max(10, temp * width);
        const scale = Math.min(mag, maxDisp) / mag;
        pos[id].x += f.fx * scale;
        pos[id].y += f.fy * scale;
      }
      pos[id].x = Math.max(50, Math.min(width - 50, pos[id].x));
      pos[id].y = Math.max(50, Math.min(height - 50, pos[id].y));
    }
  }

  return pos;
}

// ─── Helpers ──────────────────────────────────────────────

function getNeighbors(nodeId: string, depth: number, allEdges: typeof SYSTEM_EDGES): Set<string> {
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const e of allEdges) {
        if (e.source === e.target) continue;
        if (e.source === id && !visited.has(e.target)) { visited.add(e.target); next.add(e.target); }
        if (e.target === id && !visited.has(e.source)) { visited.add(e.source); next.add(e.source); }
      }
    }
    frontier = next;
  }
  return visited;
}

function getVisibleNodes(
  selected: string[], depth: number, mode: "union" | "intersection", edges: typeof SYSTEM_EDGES,
): Set<string> | null {
  if (selected.length === 0) return null;
  const sets = selected.map(id => getNeighbors(id, depth, edges));
  if (mode === "union") {
    const union = new Set<string>();
    sets.forEach(s => s.forEach(id => union.add(id)));
    return union;
  }
  const [first, ...rest] = sets;
  const inter = new Set<string>();
  for (const id of first) {
    if (rest.every(s => s.has(id))) inter.add(id);
  }
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
        opacity: dimmed ? 0.12 : 1,
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
        {node.dbTable && <span className="text-[9px] px-1 rounded bg-blue-900/50">DB</span>}
      </div>
      <div className="text-[9px] leading-tight opacity-80 mb-1">
        {node.upstreamCount} in / {node.downstreamCount} out
      </div>
      {node.gaps.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {node.gaps.map(g => (
            <span key={g} className="text-[8px] px-1 rounded bg-red-900/60 text-red-200">{g}</span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { systemNode: SystemNodeComponent };

const ALL_LINK_TYPES: LinkType[] = ["causal", "modifier", "threshold", "unlock", "event_driven", "projection"];
const ALL_LAYERS: SystemLayer[] = ["core", "economy_v41", "military", "narrative", "infrastructure", "social"];

interface Props {
  sessionId?: string;
}

const SystemGraphPanel = ({ sessionId }: Props) => {
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [depth, setDepth] = useState(1);
  const [mode, setMode] = useState<"union" | "intersection">("union");
  const [enabledLinks, setEnabledLinks] = useState<Set<LinkType>>(new Set(ALL_LINK_TYPES));
  const [enabledLayers, setEnabledLayers] = useState<Set<SystemLayer>>(new Set(ALL_LAYERS));
  const [detailNode, setDetailNode] = useState<SysNode | null>(null);
  const [liveData, setLiveData] = useState<any>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const toggleLink = useCallback((lt: LinkType) => {
    setEnabledLinks(prev => { const n = new Set(prev); n.has(lt) ? n.delete(lt) : n.add(lt); return n; });
  }, []);

  const toggleLayer = useCallback((layer: SystemLayer) => {
    setEnabledLayers(prev => { const n = new Set(prev); n.has(layer) ? n.delete(layer) : n.add(layer); return n; });
  }, []);

  // Filter nodes by enabled layers
  const layerFilteredNodes = useMemo(
    () => SYSTEM_NODES.filter(n => n.layers.some(l => enabledLayers.has(l))),
    [enabledLayers],
  );

  const layerNodeIds = useMemo(() => new Set(layerFilteredNodes.map(n => n.id)), [layerFilteredNodes]);

  // Filter edges
  const filteredEdges = useMemo(
    () => SYSTEM_EDGES.filter(e =>
      enabledLinks.has(e.linkType) &&
      layerNodeIds.has(e.source) &&
      layerNodeIds.has(e.target) &&
      e.source !== e.target
    ),
    [enabledLinks, layerNodeIds],
  );

  // Compute positions with force-directed layout
  const positions = useMemo(
    () => forceDirectedLayout(
      layerFilteredNodes.map(n => n.id),
      filteredEdges,
      1800,
      1200,
    ),
    [layerFilteredNodes, filteredEdges],
  );

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedNodes(prev => {
      if (prev.includes(id)) {
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

  // Compute visible set
  const visibleSet = useMemo(
    () => getVisibleNodes(selectedNodes, depth, mode, filteredEdges),
    [selectedNodes, depth, mode, filteredEdges],
  );

  // Build React Flow nodes
  const rfNodes: Node[] = useMemo(() => {
    return layerFilteredNodes.map(sysNode => ({
      id: sysNode.id,
      type: "systemNode",
      position: positions[sysNode.id] ?? { x: 0, y: 0 },
      data: {
        node: sysNode,
        dimmed: visibleSet !== null && !visibleSet.has(sysNode.id),
        isSelected: selectedNodes.includes(sysNode.id),
        onSelect: handleNodeSelect,
      },
    }));
  }, [layerFilteredNodes, positions, visibleSet, selectedNodes, handleNodeSelect]);

  // Build React Flow edges
  const rfEdges: Edge[] = useMemo(() => {
    return filteredEdges.map((e, i) => {
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

  // Detail edges
  const detailEdges = useMemo(() => {
    if (!detailNode) return { incoming: [] as typeof SYSTEM_EDGES, outgoing: [] as typeof SYSTEM_EDGES };
    return {
      incoming: SYSTEM_EDGES.filter(e => e.target === detailNode.id && e.source !== e.target),
      outgoing: SYSTEM_EDGES.filter(e => e.source === detailNode.id && e.source !== e.target),
    };
  }, [detailNode]);

  // Fetch live data when detail opens
  useEffect(() => {
    if (!detailNode?.dbTable || !sessionId) { setLiveData(null); return; }
    setLoadingLive(true);
    const fetchLive = async () => {
      try {
        const { data, count } = await supabase
          .from(detailNode.dbTable as any)
          .select("*", { count: "exact", head: false })
          .eq("session_id", sessionId)
          .limit(5);
        setLiveData({ count, sample: data });
      } catch {
        setLiveData(null);
      }
      setLoadingLive(false);
    };
    fetchLive();
  }, [detailNode, sessionId]);

  return (
    <div className="space-y-3">
      {/* Layer filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium">Vrstvy:</span>
        {ALL_LAYERS.map(layer => {
          const meta = LAYER_META[layer];
          const active = enabledLayers.has(layer);
          const count = SYSTEM_NODES.filter(n => n.layers.includes(layer)).length;
          return (
            <Button
              key={layer}
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => toggleLayer(layer)}
              style={active ? { backgroundColor: meta.color + "33", borderColor: meta.color, color: meta.color } : {}}
            >
              {meta.icon} {meta.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Status legend + link toggles */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(STATUS_COLORS).map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c.border, color: c.border }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} />
            {key}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] text-muted-foreground font-medium">Links:</span>
        {ALL_LINK_TYPES.map(lt => (
          <label key={lt} className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={enabledLinks.has(lt)} onCheckedChange={() => toggleLink(lt)} className="h-3.5 w-3.5" />
            <svg width="16" height="6">
              <line x1="0" y1="3" x2="16" y2="3" stroke={LINK_STYLES[lt].stroke} strokeWidth="2" strokeDasharray={LINK_STYLES[lt].dashArray || "0"} />
            </svg>
            <span className="text-[10px]" style={{ color: LINK_STYLES[lt].stroke }}>{LINK_STYLES[lt].label}</span>
          </label>
        ))}
      </div>

      {/* Isolation controls */}
      <div className="flex flex-wrap items-center gap-3 bg-card/50 border rounded-lg p-2">
        <span className="text-[10px] text-muted-foreground font-medium">Isolation:</span>
        <div className="flex items-center gap-2 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground">Depth</span>
          <Slider min={1} max={3} step={1} value={[depth]} onValueChange={([v]) => setDepth(v)} className="w-[80px]" />
          <span className="text-[10px] font-mono font-bold">{depth}</span>
        </div>
        <Button size="sm" variant={mode === "union" ? "default" : "outline"} className="h-6 text-[10px] gap-1 px-2" onClick={() => setMode("union")}>
          <Combine className="h-3 w-3" /> Union
        </Button>
        <Button size="sm" variant={mode === "intersection" ? "default" : "outline"} className="h-6 text-[10px] gap-1 px-2" onClick={() => setMode("intersection")}>
          <Merge className="h-3 w-3" /> Intersect
        </Button>
        {selectedNodes.map(id => {
          const sn = SYSTEM_NODES.find(n => n.id === id);
          return (
            <Badge key={id} className="text-[10px] gap-1 h-5 cursor-pointer" onClick={() => removeSelection(id)}>
              {sn?.label ?? id} <X className="h-2.5 w-2.5" />
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

      {/* Stats */}
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span>📊 {layerFilteredNodes.length} uzlů</span>
        <span>🔗 {filteredEdges.length} vazeb</span>
        <span>🏷️ {enabledLayers.size}/{ALL_LAYERS.length} vrstev</span>
      </div>

      {/* Graph */}
      <div className="w-full h-[700px] border rounded-lg bg-background/50">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onPaneClick={clearSelection}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              const sysNode = SYSTEM_NODES.find(s => s.id === n.id);
              return sysNode ? STATUS_COLORS[sysNode.status].border : "#666";
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail Drawer */}
      <Sheet open={!!detailNode} onOpenChange={(open) => { if (!open) { setDetailNode(null); setLiveData(null); } }}>
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

                {/* Layers */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {detailNode.layers.map(l => (
                    <Badge key={l} variant="outline" className="text-[9px]" style={{ borderColor: LAYER_META[l].color, color: LAYER_META[l].color }}>
                      {LAYER_META[l].icon} {LAYER_META[l].label}
                    </Badge>
                  ))}
                </div>

                {/* Scores */}
                <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                  <ScoreBar label="Player influence" value={detailNode.playerInfluenceScore} max={10} color="#22c55e" />
                  <ScoreBar label="AI dependency" value={detailNode.aiDependencyScore} max={10} color="#a855f7" />
                  <ScoreBar label="UI surfacing" value={detailNode.uiSurfacingLevel} max={10} color="#3b82f6" />
                </div>

                {/* DB Info */}
                {(detailNode.dbTable || detailNode.writerFn) && (
                  <div className="mb-4 bg-muted/30 rounded p-2">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1"><Database className="h-3 w-3" /> Data Source</p>
                    {detailNode.dbTable && <p className="text-[10px] font-mono">📋 {detailNode.dbTable}</p>}
                    {detailNode.writerFn && <p className="text-[10px] font-mono">✍️ {detailNode.writerFn}</p>}
                  </div>
                )}

                {/* Live data */}
                {sessionId && detailNode.dbTable && (
                  <div className="mb-4">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">📡 Live Data</p>
                    {loadingLive ? (
                      <p className="text-[9px] text-muted-foreground animate-pulse">Načítám…</p>
                    ) : liveData ? (
                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-[10px] font-semibold mb-1">Celkem: {liveData.count ?? "?"} záznamů</p>
                        {liveData.sample?.length > 0 && (
                          <pre className="text-[9px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {JSON.stringify(liveData.sample[0], null, 2).slice(0, 500)}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <p className="text-[9px] text-muted-foreground italic">Žádná data</p>
                    )}
                  </div>
                )}

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
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Incoming ({detailEdges.incoming.length})</p>
                  {detailEdges.incoming.map((e, i) => (
                    <EdgeRow key={i} from={e.source} label={e.label} linkType={e.linkType} />
                  ))}
                  {detailEdges.incoming.length === 0 && <p className="text-[9px] text-muted-foreground italic">Žádné vstupy</p>}
                </div>

                {/* Outgoing edges */}
                <div className="mb-4">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Outgoing ({detailEdges.outgoing.length})</p>
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
  return (
    <div>
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
        </div>
        <span className="text-[9px] font-mono" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

function EdgeRow({ from, label, linkType }: { from: string; label?: string; linkType: LinkType }) {
  const sn = SYSTEM_NODES.find(n => n.id === from);
  const style = LINK_STYLES[linkType];
  return (
    <div className="flex items-center gap-1.5 text-[10px] py-0.5">
      <svg width="12" height="6">
        <line x1="0" y1="3" x2="12" y2="3" stroke={style.stroke} strokeWidth="2" strokeDasharray={style.dashArray || "0"} />
      </svg>
      <span className="font-medium">{sn?.label ?? from}</span>
      {label && <span className="text-muted-foreground">— {label}</span>}
    </div>
  );
}

export default SystemGraphPanel;
