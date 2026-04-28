/**
 * WorldMapBuildPanel — Stage 8
 *
 * Floating panel (bottom-left) for player infrastructure actions on WorldMap:
 *   1. Build Mode: pick A & B node → A* preview length → BUILD_ROUTE
 *   2. Routes Under Construction: list, assign idle stack, cancel
 *
 * Pure-presentation: every mutation goes through dispatchCommand.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hammer, Plus, X, Users, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { findHexPath } from "@/lib/hexPathfinding";

interface NodeRow {
  id: string;
  name: string;
  hex_q: number;
  hex_r: number;
  controlled_by: string | null;
  node_tier: string | null;
}

interface RouteRow {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  metadata: any;
  build_cost: number | null;
}

interface StackRow {
  id: string;
  name: string;
  soldiers: number | null;
  unit_count: number | null;
  assignment: string | null;
  assigned_route_id: string | null;
}

const ROUTE_TYPE_OPTIONS: Array<{ key: string; label: string; cost: number }> = [
  { key: "trail", label: "Stezka", cost: 50 },
  { key: "road", label: "Cesta", cost: 100 },
  { key: "paved", label: "Dlážděná", cost: 200 },
];

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
}

export default function WorldMapBuildPanel({ sessionId, playerName, currentTurn }: Props) {
  const [open, setOpen] = useState(true);
  const [section, setSection] = useState<"build" | "construction">("build");

  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [stacks, setStacks] = useState<StackRow[]>([]);

  const [nodeAId, setNodeAId] = useState<string>("");
  const [nodeBId, setNodeBId] = useState<string>("");
  const [routeType, setRouteType] = useState<string>("road");
  const [soldiers, setSoldiers] = useState<number>(50);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const [nRes, rRes, sRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, name, hex_q, hex_r, controlled_by, node_tier")
        .eq("session_id", sessionId).eq("is_active", true),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, metadata, build_cost")
        .eq("session_id", sessionId).eq("construction_state", "under_construction"),
      supabase.from("military_stacks")
        .select("id, name, soldiers, unit_count, assignment, assigned_route_id")
        .eq("session_id", sessionId)
        .or(`owner_player.eq.${playerName},player_name.eq.${playerName}`)
        .eq("is_active", true),
    ]);
    setNodes((nRes.data || []) as NodeRow[]);
    setRoutes((rRes.data || []) as RouteRow[]);
    setStacks((sRes.data || []) as StackRow[]);
  };

  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel(`build-panel-${sessionId}-${playerName}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "province_routes", filter: `session_id=eq.${sessionId}` },
        () => { void refresh(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "military_stacks", filter: `session_id=eq.${sessionId}` },
        () => { void refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, playerName]);

  const ownNodes = useMemo(() => nodes.filter(n => n.controlled_by === playerName), [nodes, playerName]);
  const allNodesById = useMemo(() => {
    const m = new Map<string, NodeRow>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // A* preview between selected nodes (axial hex distance via shared util)
  const preview = useMemo(() => {
    if (!nodeAId || !nodeBId || nodeAId === nodeBId) return null;
    const a = allNodesById.get(nodeAId);
    const b = allNodesById.get(nodeBId);
    if (!a || !b) return null;
    const path = findHexPath({ q: a.hex_q, r: a.hex_r }, { q: b.hex_q, r: b.hex_r });
    return path ? { length: path.length, path } : null;
  }, [nodeAId, nodeBId, allNodesById]);

  const idleStacks = useMemo(
    () => stacks.filter(s => (s.assignment || "idle") === "idle" && !s.assigned_route_id),
    [stacks],
  );

  const handleBuild = async () => {
    if (!nodeAId || !nodeBId) { toast.error("Vyberte oba uzly"); return; }
    if (nodeAId === nodeBId) { toast.error("Uzly musí být různé"); return; }
    if (soldiers < 50) { toast.error("Minimálně 50 vojáků"); return; }
    setSubmitting(true);
    const res = await dispatchCommand({
      sessionId,
      turnNumber: currentTurn,
      actor: { name: playerName },
      commandType: "BUILD_ROUTE",
      commandPayload: {
        nodeAId, nodeBId,
        routeType,
        soldiers,
        hexPath: preview?.path || [],
      },
    });
    setSubmitting(false);
    if (!res.ok) { toast.error(res.error || "Stavba selhala"); return; }
    toast.success("Stavba zahájena");
    setNodeAId(""); setNodeBId("");
    void refresh();
  };

  const handleAssign = async (routeId: string, stackId: string) => {
    const res = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: playerName },
      commandType: "ASSIGN_STACK_TO_ROUTE",
      commandPayload: { routeId, stackId },
    });
    if (!res.ok) { toast.error(res.error || "Přiřazení selhalo"); return; }
    toast.success("Stack přiřazen");
    void refresh();
  };

  const handleCancel = async (routeId: string) => {
    const res = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: playerName },
      commandType: "CANCEL_ROUTE_CONSTRUCTION",
      commandPayload: { routeId },
    });
    if (!res.ok) { toast.error(res.error || "Zrušení selhalo"); return; }
    toast.success("Stavba zrušena");
    void refresh();
  };

  const selectedRouteCost = ROUTE_TYPE_OPTIONS.find(o => o.key === routeType)?.cost || 100;

  return (
    <div className="absolute bottom-2 left-2 z-30 pointer-events-auto">
      <div className="rounded-lg bg-card/95 backdrop-blur-md border border-border shadow-xl w-[300px]">
        {/* Header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-border hover:bg-muted/40 transition-colors">
          <span className="flex items-center gap-1.5 text-xs font-display font-bold tracking-wider uppercase">
            <Hammer className="h-3.5 w-3.5 text-primary" />
            Infrastruktura
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>

        {open && (
          <>
            {/* Section tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setSection("build")}
                className={`flex-1 text-[11px] font-display font-semibold py-1.5 transition-colors ${section === "build" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}>
                Postavit
              </button>
              <button
                onClick={() => setSection("construction")}
                className={`flex-1 text-[11px] font-display font-semibold py-1.5 transition-colors ${section === "construction" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}>
                Ve stavbě ({routes.length})
              </button>
            </div>

            {section === "build" && (
              <div className="p-3 space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Z</label>
                  <select
                    value={nodeAId}
                    onChange={e => setNodeAId(e.target.value)}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1">
                    <option value="">— vyberte —</option>
                    {ownNodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.node_tier})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Do</label>
                  <select
                    value={nodeBId}
                    onChange={e => setNodeBId(e.target.value)}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1">
                    <option value="">— vyberte —</option>
                    {nodes.filter(n => n.id !== nodeAId).map(n => (
                      <option key={n.id} value={n.id}>{n.name} {n.controlled_by ? `(${n.controlled_by})` : "(neutral)"}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Typ</label>
                    <select
                      value={routeType}
                      onChange={e => setRouteType(e.target.value)}
                      className="w-full text-xs bg-background border border-border rounded px-2 py-1 mt-0.5">
                      {ROUTE_TYPE_OPTIONS.map(o => (
                        <option key={o.key} value={o.key}>{o.label} ({o.cost}💰)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Vojáci</label>
                    <input
                      type="number" min={50} step={10}
                      value={soldiers}
                      onChange={e => setSoldiers(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="w-full text-xs bg-background border border-border rounded px-2 py-1 mt-0.5 font-mono" />
                  </div>
                </div>

                {preview && (
                  <div className="text-[11px] font-mono bg-muted/40 rounded px-2 py-1 flex items-center justify-between">
                    <span>A* preview</span>
                    <span><Badge variant="outline" className="h-4 text-[10px]">{preview.length} hex</Badge></span>
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full h-7 text-xs gap-1"
                  onClick={handleBuild}
                  disabled={submitting || !nodeAId || !nodeBId || nodeAId === nodeBId || soldiers < 50}>
                  <Plus className="h-3 w-3" />
                  Postavit ({selectedRouteCost} 💰 + {soldiers} vojáků)
                </Button>
              </div>
            )}

            {section === "construction" && (
              <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
                {routes.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Žádné rozestavěné cesty.</p>
                )}
                {routes.map(r => {
                  const md = r.metadata || {};
                  const total = Number(md.total_work || 0);
                  const progress = Number(md.progress || 0);
                  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
                  const builtByMe = md.built_by === playerName;
                  const a = allNodesById.get(r.node_a);
                  const b = allNodesById.get(r.node_b);
                  const assignedHere = stacks.filter(s => s.assigned_route_id === r.id);
                  return (
                    <div key={r.id} className="rounded border border-border bg-muted/20 p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">
                          {a?.name || "?"} ↔ {b?.name || "?"}
                        </span>
                        <Badge variant="outline" className="h-4 text-[10px]">{r.route_type}</Badge>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>{progress} / {total} ({pct}%)</span>
                        {assignedHere.length > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {assignedHere.reduce((s, x) => s + (x.soldiers || x.unit_count || 0), 0)}
                          </span>
                        )}
                      </div>

                      {builtByMe && (
                        <div className="flex items-center gap-1">
                          {idleStacks.length > 0 ? (
                            <select
                              defaultValue=""
                              onChange={e => { if (e.target.value) handleAssign(r.id, e.target.value); }}
                              className="flex-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5">
                              <option value="">+ Přiřadit stack</option>
                              {idleStacks.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.soldiers || s.unit_count || 0})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="flex-1 text-[10px] text-muted-foreground italic">Žádný idle stack</span>
                          )}
                          <Button
                            size="icon" variant="ghost" className="h-5 w-5"
                            onClick={() => handleCancel(r.id)} title="Zrušit stavbu">
                            <Trash2 className="h-2.5 w-2.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
