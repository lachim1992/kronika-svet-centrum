/**
 * RouteDetailSheet — opens when player clicks a road on the WorldMap.
 *
 * Listens to "worldmap:route-click" events emitted by RoadNetworkOverlay,
 * loads the route + endpoints + route_state, and offers actions:
 *   - Rename (RENAME_ROUTE)
 *   - Upgrade tier (UPGRADE_ROUTE) trail → road → paved
 *   - Invest maintenance / Restore / Abandon (manage-route edge function)
 *   - "Stavět odsud" — pre-fill the build panel with one endpoint.
 *
 * Only the route owner (built_by, or controller of either endpoint) sees actions.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Pencil, ArrowUpCircle, Wrench, RotateCcw, X, Hammer,
  Activity, Shield, Gauge, Layers, MapPin, Check,
} from "lucide-react";
import { toast } from "sonner";
import { WORLDMAP_EVENTS, emitFocusBuild } from "@/lib/worldMapBus";

interface NodeRow {
  id: string;
  name: string;
  controlled_by: string | null;
}

interface RouteRow {
  id: string;
  session_id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  upgrade_level: number;
  capacity_value: number;
  speed_value: number | null;
  vulnerability_score: number;
  control_state: string;
  build_cost: number | null;
  construction_state: string | null;
  hex_path_length: number | null;
  metadata: any;
  name: string | null;
  waypoints: any;
}

interface RouteStateRow {
  maintenance_level: number | null;
  lifecycle_state: string | null;
  turns_unpaid: number | null;
  player_invested_gold: number | null;
}

const TIER_ORDER = ["trail", "road", "paved"] as const;
const TIER_LABELS: Record<string, string> = { trail: "Stezka", road: "Cesta", paved: "Dlážděná" };
const LEGACY_MAP: Record<string, string> = {
  land_road: "road", caravan_route: "road", river_route: "road",
  sea_lane: "road", mountain_pass: "trail",
};

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
}

export default function RouteDetailSheet({ sessionId, playerName, currentTurn }: Props) {
  const [routeId, setRouteId] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [nodeA, setNodeA] = useState<NodeRow | null>(null);
  const [nodeB, setNodeB] = useState<NodeRow | null>(null);
  const [state, setState] = useState<RouteStateRow | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // Listen for clicks on roads.
  useEffect(() => {
    const onClick = (e: Event) => {
      const id = (e as CustomEvent).detail?.routeId;
      if (id) setRouteId(id);
    };
    window.addEventListener(WORLDMAP_EVENTS.routeClick, onClick);
    return () => window.removeEventListener(WORLDMAP_EVENTS.routeClick, onClick);
  }, []);

  // Load route data when opened.
  useEffect(() => {
    if (!routeId) {
      setRoute(null); setNodeA(null); setNodeB(null); setState(null);
      setEditingName(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: r } = await supabase
        .from("province_routes")
        .select("id, session_id, node_a, node_b, route_type, upgrade_level, capacity_value, speed_value, vulnerability_score, control_state, build_cost, construction_state, hex_path_length, metadata, name, waypoints")
        .eq("id", routeId).maybeSingle();
      if (cancelled || !r) return;
      setRoute(r as RouteRow);

      const [aRes, bRes, sRes] = await Promise.all([
        supabase.from("province_nodes").select("id, name, controlled_by").eq("id", r.node_a).maybeSingle(),
        supabase.from("province_nodes").select("id, name, controlled_by").eq("id", r.node_b).maybeSingle(),
        supabase.from("route_state")
          .select("maintenance_level, lifecycle_state, turns_unpaid, player_invested_gold")
          .eq("route_id", routeId).maybeSingle(),
      ]);
      if (cancelled) return;
      setNodeA((aRes.data as any) || null);
      setNodeB((bRes.data as any) || null);
      setState((sRes.data as any) || null);
      setNameDraft((r as RouteRow).name || "");
    })();
    return () => { cancelled = true; };
  }, [routeId]);

  if (!route) {
    return (
      <Sheet open={!!routeId} onOpenChange={(o) => { if (!o) setRouteId(null); }}>
        <SheetContent side="right" className="w-[380px] sm:w-[440px]">
          <SheetHeader>
            <SheetTitle>Načítám…</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const builtBy = route.metadata?.built_by;
  const isOwner =
    builtBy === playerName ||
    nodeA?.controlled_by === playerName ||
    nodeB?.controlled_by === playerName;

  const displayName = route.name?.trim() || `Via ${nodeA?.name || "?"} – ${nodeB?.name || "?"}`;
  const normalizedTier = LEGACY_MAP[route.route_type] || route.route_type;
  const tierIdx = TIER_ORDER.indexOf(normalizedTier as any);
  const nextTier = tierIdx >= 0 && tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const upgradeCost = nextTier ? Math.round((route.build_cost || 50) * 0.5 * (route.upgrade_level + 1)) : 0;

  const isUnderConstruction = route.construction_state === "under_construction";
  const isBlocked = state?.lifecycle_state === "blocked" || route.control_state === "blocked";

  const close = () => setRouteId(null);

  const runCommand = async (commandType: string, payload: any, successMsg: string) => {
    setBusy(true);
    const res = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: playerName },
      commandType,
      commandPayload: { ...payload, routeId: route.id },
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Akce selhala"); return false; }
    toast.success(successMsg);
    // Refresh local
    setRouteId(route.id); // re-trigger load via key; simpler: manual reload
    return true;
  };

  const handleRename = async () => {
    const trimmed = nameDraft.trim().slice(0, 60);
    const ok = await runCommand("RENAME_ROUTE", { name: trimmed }, "Cesta přejmenována");
    if (ok) {
      setEditingName(false);
      setRoute(r => r ? { ...r, name: trimmed || null } : r);
    }
  };

  const handleUpgrade = async () => {
    if (!nextTier) return;
    const ok = await runCommand("UPGRADE_ROUTE", {}, `Cesta vylepšena na ${TIER_LABELS[nextTier]}`);
    if (ok) {
      setRoute(r => r ? { ...r, route_type: nextTier, upgrade_level: r.upgrade_level + 1 } : r);
    }
  };

  const callManage = async (command: "INVEST_MAINTENANCE" | "RESTORE_ROUTE" | "ABANDON_ROUTE", successMsg: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-route", {
      body: {
        sessionId, routeId: route.id, command, playerName, turnNumber: currentTurn,
      },
    });
    setBusy(false);
    if (error || (data && !data.ok && data.error)) {
      toast.error(error?.message || data?.error || "Akce selhala");
      return;
    }
    toast.success(successMsg);
    // Reload state
    const { data: rs } = await supabase.from("route_state")
      .select("maintenance_level, lifecycle_state, turns_unpaid, player_invested_gold")
      .eq("route_id", route.id).maybeSingle();
    setState((rs as any) || null);
    if (command === "ABANDON_ROUTE") close();
  };

  const handleStartFromHere = (nodeId: string) => {
    emitFocusBuild(nodeId);
    close();
  };

  return (
    <Sheet open={!!routeId} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-[380px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-start justify-between gap-2">
            {editingName ? (
              <div className="flex-1 flex items-center gap-1">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={60}
                  placeholder={`Via ${nodeA?.name || "?"} – ${nodeB?.name || "?"}`}
                  className="h-7 text-sm" />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleRename} disabled={busy}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingName(false); setNameDraft(route.name || ""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5">
                {displayName}
                {isOwner && (
                  <Button size="icon" variant="ghost" className="h-5 w-5"
                    onClick={() => { setNameDraft(route.name || ""); setEditingName(true); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline">{TIER_LABELS[normalizedTier] || route.route_type}</Badge>
            <Badge variant="secondary">úroveň {route.upgrade_level}</Badge>
            {isUnderConstruction && <Badge variant="outline" className="border-amber-500 text-amber-500">Ve stavbě</Badge>}
            {isBlocked && <Badge variant="destructive">Blokována</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Endpoints */}
          <section className="space-y-1.5">
            <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-muted-foreground">
              Spojení
            </h4>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => isOwner && nodeA && handleStartFromHere(nodeA.id)}
                disabled={!isOwner}
                className="font-semibold hover:underline disabled:no-underline disabled:cursor-default">
                {nodeA?.name || "?"}
              </button>
              <span className="text-muted-foreground">↔</span>
              <button
                onClick={() => isOwner && nodeB && handleStartFromHere(nodeB.id)}
                disabled={!isOwner}
                className="font-semibold hover:underline disabled:no-underline disabled:cursor-default">
                {nodeB?.name || "?"}
              </button>
            </div>
            {isOwner && (
              <p className="text-[10px] text-muted-foreground italic">
                Klikněte na uzel pro stavbu navazující cesty.
              </p>
            )}
          </section>

          <Separator />

          {/* Stats */}
          <section className="grid grid-cols-2 gap-2 text-xs">
            <Stat icon={<Layers className="h-3 w-3" />} label="Kapacita" value={String(route.capacity_value)} />
            <Stat icon={<Gauge className="h-3 w-3" />} label="Rychlost" value={String(route.speed_value ?? "—")} />
            <Stat icon={<Shield className="h-3 w-3" />} label="Zranitelnost" value={String(route.vulnerability_score)} />
            <Stat icon={<MapPin className="h-3 w-3" />} label="Délka" value={`${route.hex_path_length ?? "?"} hex`} />
          </section>

          {state && (
            <>
              <Separator />
              <section className="space-y-1.5">
                <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Údržba
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Úroveň" value={`${state.maintenance_level ?? 0}/100`} />
                  <Stat label="Stav" value={state.lifecycle_state || "—"} />
                  <Stat label="Nezaplacené tahy" value={String(state.turns_unpaid ?? 0)} />
                  <Stat label="Investováno" value={`${state.player_invested_gold ?? 0}g`} />
                </div>
              </section>
            </>
          )}

          {/* Waypoints */}
          {Array.isArray(route.waypoints) && route.waypoints.length > 0 && (
            <>
              <Separator />
              <section className="space-y-1">
                <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-muted-foreground">
                  Plánované waypointy
                </h4>
                <div className="flex flex-wrap gap-1">
                  {(route.waypoints as Array<{q: number; r: number}>).map((w, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-mono">
                      ({w.q},{w.r})
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Actions */}
          {isOwner && !isUnderConstruction && (
            <>
              <Separator />
              <section className="space-y-2">
                <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-muted-foreground">
                  Akce vlastníka
                </h4>

                {nextTier ? (
                  <Button onClick={handleUpgrade} disabled={busy} size="sm" className="w-full gap-1.5">
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    Upgrade na {TIER_LABELS[nextTier]} ({upgradeCost} g)
                  </Button>
                ) : (
                  <Button disabled size="sm" variant="outline" className="w-full">
                    Maximální tier
                  </Button>
                )}

                <Button onClick={() => callManage("INVEST_MAINTENANCE", "Údržba zaplacena (50g)")}
                  disabled={busy} size="sm" variant="outline" className="w-full gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Údržba (+30, 50 g)
                </Button>

                {isBlocked && (
                  <Button onClick={() => callManage("RESTORE_ROUTE", "Cesta obnovena")}
                    disabled={busy} size="sm" variant="outline" className="w-full gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Obnovit (200 g)
                  </Button>
                )}

                <Button onClick={() => {
                  if (window.confirm(`Opravdu opustit cestu „${displayName}"? Tato akce je nevratná.`)) {
                    void callManage("ABANDON_ROUTE", "Cesta opuštěna");
                  }
                }} disabled={busy} size="sm" variant="destructive" className="w-full gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Opustit cestu
                </Button>

                {nodeA && (
                  <Button onClick={() => handleStartFromHere(nodeA.id)} size="sm" variant="ghost" className="w-full gap-1.5 text-xs">
                    <Hammer className="h-3 w-3" />
                    Stavět odsud ({nodeA.name})
                  </Button>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-xs font-mono font-semibold">{value}</div>
    </div>
  );
}
