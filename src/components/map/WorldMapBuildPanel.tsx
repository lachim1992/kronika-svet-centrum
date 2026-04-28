/**
 * WorldMapBuildPanel — Stage 8 (v2: waypoint planning + custom names)
 *
 * Floating panel (bottom-left) for player infrastructure actions on WorldMap:
 *   1. Build Mode: pick A & B node, optionally add waypoint hexes, set custom name
 *   2. Routes Under Construction: list, assign idle stack, cancel
 *
 * Waypoint flow:
 *   - "Plánovat trasu" toggle activates build mode (worldmap:build-mode)
 *   - Clicking hexes on the map emits worldmap:hex-click events
 *   - Hexes go into a sequential waypoint list; A* on the server chains
 *     start → wp1 → wp2 → … → end via these forced points.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { computeWorkforceBreakdown } from "@/lib/economyConstants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Hammer, Plus, X, HardHat, ChevronDown, ChevronUp, Trash2, Users,
  MapPin, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { emitBuildMode, WORLDMAP_EVENTS, type HexCoord } from "@/lib/worldMapBus";

function axialHexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

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
  name: string | null;
}

interface StackRow {
  id: string;
  name: string;
  soldiers: number | null;
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
  const [labor, setLabor] = useState<number>(100);
  const [laborAvailable, setLaborAvailable] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // v2 additions
  const [routeName, setRouteName] = useState<string>("");
  const [planning, setPlanning] = useState<boolean>(false);
  const [waypoints, setWaypoints] = useState<HexCoord[]>([]);

  // Sync planning state with the global bus so the map knows to redirect clicks.
  useEffect(() => {
    emitBuildMode(planning);
    return () => emitBuildMode(false);
  }, [planning]);

  // Receive hex clicks from the map while planning is active.
  useEffect(() => {
    if (!planning) return;
    const onHex = (e: Event) => {
      const detail = (e as CustomEvent).detail as HexCoord;
      if (!detail) return;
      setWaypoints((prev) => {
        // Toggle: clicking an existing waypoint removes it.
        const idx = prev.findIndex((w) => w.q === detail.q && w.r === detail.r);
        if (idx >= 0) return prev.filter((_, i) => i !== idx);
        return [...prev, { q: detail.q, r: detail.r }];
      });
    };
    window.addEventListener(WORLDMAP_EVENTS.hexClick, onHex);
    return () => window.removeEventListener(WORLDMAP_EVENTS.hexClick, onHex);
  }, [planning]);

  // Listen for "Stavět odsud" from the route detail sheet.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string };
      if (detail?.nodeId) {
        setSection("build");
        setOpen(true);
        setNodeAId(detail.nodeId);
        setNodeBId("");
        setWaypoints([]);
      }
    };
    window.addEventListener(WORLDMAP_EVENTS.focusBuild, onFocus);
    return () => window.removeEventListener(WORLDMAP_EVENTS.focusBuild, onFocus);
  }, []);

  const refresh = async () => {
    const [nRes, rRes, sRes, realmRes, citiesRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, name, hex_q, hex_r, controlled_by, node_tier")
        .eq("session_id", sessionId).eq("is_active", true),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, metadata, build_cost, name")
        .eq("session_id", sessionId).eq("construction_state", "under_construction"),
      supabase.from("military_stacks")
        .select("id, name, soldiers, assignment, assigned_route_id")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .eq("is_active", true),
      supabase.from("realm_resources")
        .select("mobilization_rate")
        .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle(),
      supabase.from("cities")
        .select("status, owner_player, population_peasants, population_burghers, population_clerics")
        .eq("session_id", sessionId).eq("owner_player", playerName),
    ]);
    setNodes((nRes.data || []) as NodeRow[]);
    setRoutes((rRes.data || []) as RouteRow[]);
    setStacks((sRes.data || []) as StackRow[]);
    const mobRate = Number((realmRes.data as any)?.mobilization_rate || 0.1);
    const wf = computeWorkforceBreakdown((citiesRes.data || []) as any[], mobRate);
    setLaborAvailable(wf.workforce);
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
    // Chained length: A → wp1 → … → wpN → B
    const chain: HexCoord[] = [{ q: a.hex_q, r: a.hex_r }, ...waypoints, { q: b.hex_q, r: b.hex_r }];
    let length = 0;
    for (let i = 1; i < chain.length; i++) length += axialHexDistance(chain[i - 1], chain[i]);
    return { length, path: chain };
  }, [nodeAId, nodeBId, allNodesById, waypoints]);

  const idleStacks = useMemo(
    () => stacks.filter(s => (s.assignment || "idle") === "idle" && !s.assigned_route_id),
    [stacks],
  );

  const handleBuild = async () => {
    if (!nodeAId || !nodeBId) { toast.error("Vyberte oba uzly"); return; }
    if (nodeAId === nodeBId) { toast.error("Uzly musí být různé"); return; }
    if (labor < 50) { toast.error("Minimálně 50 pracovní síly"); return; }
    if (labor > laborAvailable) { toast.error(`Nedostatek pracovní síly (k dispozici: ${laborAvailable})`); return; }
    setSubmitting(true);
    const res = await dispatchCommand({
      sessionId,
      turnNumber: currentTurn,
      actor: { name: playerName },
      commandType: "BUILD_ROUTE",
      commandPayload: {
        nodeAId, nodeBId,
        routeType,
        labor,
        name: routeName.trim() || undefined,
        waypoints,
        hexPath: preview?.path || [],
      },
    });
    setSubmitting(false);
    if (!res.ok) { toast.error(res.error || "Stavba selhala"); return; }
    toast.success("Stavba zahájena");
    setNodeAId(""); setNodeBId("");
    setRouteName(""); setWaypoints([]);
    setPlanning(false);
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
  const nodeAObj = nodeAId ? allNodesById.get(nodeAId) : null;
  const nodeBObj = nodeBId ? allNodesById.get(nodeBId) : null;
  const namePlaceholder = nodeAObj && nodeBObj ? `Via ${nodeAObj.name} – ${nodeBObj.name}` : "Via …";

  return (
    <div className="absolute bottom-2 left-2 z-30 pointer-events-auto">
      <div className="rounded-lg bg-card/95 backdrop-blur-md border border-border shadow-xl w-[320px]">
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

                {/* Custom name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Wand2 className="h-2.5 w-2.5" /> Název cesty (volitelné)
                  </label>
                  <input
                    type="text" maxLength={60}
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                    placeholder={namePlaceholder}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1" />
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
                    <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <HardHat className="h-2.5 w-2.5" /> Pracovní síla
                    </label>
                    <input
                      type="number" min={50} step={10} max={laborAvailable || undefined}
                      value={labor}
                      onChange={e => setLabor(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="w-full text-xs bg-background border border-border rounded px-2 py-1 mt-0.5 font-mono" />
                    <div className="text-[9px] text-muted-foreground font-mono mt-0.5">
                      k dispozici: {laborAvailable}
                    </div>
                  </div>
                </div>

                {/* Waypoint planning */}
                <div className="rounded border border-border bg-muted/20 p-1.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" /> Plánovaná trasa
                    </span>
                    <Button
                      size="sm" variant={planning ? "default" : "outline"}
                      className="h-5 text-[10px] px-2"
                      onClick={() => setPlanning(p => !p)}>
                      {planning ? "Hotovo" : "Klikat hexy"}
                    </Button>
                  </div>
                  {planning && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Klikejte hexy v mapě pro povinné průchozí body. Opakovaný klik bod odebere.
                    </p>
                  )}
                  {waypoints.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {waypoints.map((w, i) => (
                        <button
                          key={`${w.q},${w.r}`}
                          onClick={() => setWaypoints(prev => prev.filter((_, idx) => idx !== i))}
                          title="Odstranit"
                          className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 hover:bg-destructive/20 hover:border-destructive">
                          ({w.q},{w.r}) ×
                        </button>
                      ))}
                      <button
                        onClick={() => setWaypoints([])}
                        className="text-[10px] text-destructive underline">
                        vyčistit
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/70">žádné — A* zvolí přímou cestu</p>
                  )}
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
                  disabled={submitting || !nodeAId || !nodeBId || nodeAId === nodeBId || labor < 50 || labor > laborAvailable}>
                  <Plus className="h-3 w-3" />
                  Postavit ({selectedRouteCost} 💰 + {labor} 👷)
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
                  const displayName = r.name?.trim() || `Via ${a?.name || "?"} – ${b?.name || "?"}`;
                  const assignedHere = stacks.filter(s => s.assigned_route_id === r.id);
                  return (
                    <div key={r.id} className="rounded border border-border bg-muted/20 p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate" title={displayName}>
                          {displayName}
                        </span>
                        <Badge variant="outline" className="h-4 text-[10px]">{r.route_type}</Badge>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>{progress} / {total} ({pct}%)</span>
                        <span className="flex items-center gap-1.5">
                          {(md.assigned_labor || md.assigned_soldiers) > 0 && (
                            <span className="flex items-center gap-0.5" title="Vyhrazená pracovní síla">
                              <HardHat className="h-2.5 w-2.5" />
                              {md.assigned_labor || md.assigned_soldiers}
                            </span>
                          )}
                          {assignedHere.length > 0 && (
                            <span className="flex items-center gap-0.5" title="Vojenský bonus">
                              <Users className="h-2.5 w-2.5" />
                              {assignedHere.reduce((s, x) => s + (x.soldiers || 0), 0)}
                            </span>
                          )}
                        </span>
                      </div>

                      {builtByMe && (
                        <div className="flex items-center gap-1">
                          {idleStacks.length > 0 ? (
                            <select
                              defaultValue=""
                              onChange={e => { if (e.target.value) handleAssign(r.id, e.target.value); }}
                              className="flex-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5">
                              <option value="">+ Vojenský bonus (volitelné)</option>
                              {idleStacks.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.soldiers || 0})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="flex-1 text-[10px] text-muted-foreground italic">Stavba běží na pracovní síle</span>
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
