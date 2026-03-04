import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Database, Layers, History, Cpu } from "lucide-react";

type MetricType = "population" | "grain_cap";

interface Props {
  open: boolean;
  onClose: () => void;
  metric: MetricType;
  cityId: string;
  sessionId: string;
}

interface Modifier {
  source: string;
  type: string;
  value: number;
}

interface EventRow {
  id: string;
  event_type: string;
  turn_number: number;
  created_at: string;
  reference: any;
}

const ExplainDrawer = ({ open, onClose, metric, cityId, sessionId }: Props) => {
  const [city, setCity] = useState<any>(null);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !cityId) return;
    const load = async () => {
      setLoading(true);
      const [cityRes, buildRes, evtRes] = await Promise.all([
        supabase.from("cities").select("*").eq("id", cityId).single(),
        supabase.from("city_buildings").select("*").eq("city_id", cityId).eq("status", "completed"),
        supabase.from("game_events")
          .select("id, event_type, turn_number, created_at, reference")
          .eq("session_id", sessionId)
          .eq("city_id", cityId)
          .in("event_type", metric === "population"
            ? ["population_growth", "famine", "migration", "epidemic", "battle_casualties", "city_founded", "uprising"]
            : ["building_completed", "granary_built", "decree_enacted", "city_founded"]
          )
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      setCity(cityRes.data);
      setBuildings(buildRes.data || []);
      setEvents((evtRes.data || []) as EventRow[]);
      setLoading(false);
    };
    load();
  }, [open, cityId, sessionId, metric]);

  const getPopulationBreakdown = (): { base: number; modifiers: Modifier[]; total: number; field: string } => {
    if (!city) return { base: 0, modifiers: [], total: 0, field: "" };
    const peasants = city.population_peasants || 0;
    const burghers = city.population_burghers || 0;
    const clerics = city.population_clerics || 0;
    const total = city.population_total || 0;
    return {
      base: total,
      field: "cities.population_total",
      modifiers: [
        { source: "Rolníci (peasants)", type: "component", value: peasants },
        { source: "Měšťané (burghers)", type: "component", value: burghers },
        { source: "Klerici (clerics)", type: "component", value: clerics },
        { source: "Porodnost (birth_rate)", type: "rate", value: city.birth_rate || 0 },
        { source: "Úmrtnost (death_rate)", type: "rate", value: -(city.death_rate || 0) },
        { source: "Přistěhovalci (migration_in)", type: "delta", value: city.last_migration_in || 0 },
        { source: "Vystěhovalci (migration_out)", type: "delta", value: -(city.last_migration_out || 0) },
      ],
      total,
    };
  };

  const getGrainBreakdown = (): { base: number; modifiers: Modifier[]; total: number; field: string } => {
    if (!city) return { base: 0, modifiers: [], total: 0, field: "" };
    const baseCap = 500;
    const buildingMods: Modifier[] = buildings
      .filter(b => {
        const fx = b.effects as Record<string, any> || {};
        return fx.granary_capacity || fx.grain_capacity || b.category === "food";
      })
      .map(b => {
        const fx = b.effects as Record<string, any> || {};
        const bonus = fx.granary_capacity || fx.grain_capacity || 0;
        return { source: `${b.name} (building)`, type: "building", value: bonus };
      });

    const totalBuildingBonus = buildingMods.reduce((s, m) => s + m.value, 0);
    const actualCap = city.local_granary_capacity || (baseCap + totalBuildingBonus);

    return {
      base: baseCap,
      field: "cities.local_granary_capacity / realm_resources.granary_capacity",
      modifiers: [
        { source: "Základ infrastruktury", type: "base", value: baseCap },
        ...buildingMods,
      ],
      total: actualCap,
    };
  };

  const breakdown = metric === "population" ? getPopulationBreakdown() : getGrainBreakdown();

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Explain: {metric === "population" ? "Populace" : "Kapacita obilí"}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Načítání…</div>
        ) : (
          <div className="space-y-5 mt-4">
            {/* DB Field */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Database className="h-3 w-3" /> DB Field
              </div>
              <code className="text-[11px] bg-muted px-2 py-1 rounded block font-mono">
                {breakdown.field}
              </code>
            </div>

            {/* Value */}
            <div className="text-center py-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="text-3xl font-bold font-display text-primary">
                {breakdown.total.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metric === "population" ? "obyvatel" : "kapacita"}
              </div>
            </div>

            <Separator />

            {/* Breakdown */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                <Layers className="h-3 w-3 text-primary" /> Rozklad
              </div>
              <div className="space-y-1">
                {breakdown.modifiers.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                    <span className="text-muted-foreground">{m.source}</span>
                    <span className={`font-mono font-semibold ${m.value < 0 ? "text-destructive" : m.value > 0 ? "text-primary" : ""}`}>
                      {m.value > 0 ? "+" : ""}{m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Contributors (buildings) */}
            {buildings.length > 0 && metric === "grain_cap" && (
              <div>
                <div className="text-xs font-semibold mb-2">Aktivní budovy</div>
                <div className="space-y-1">
                  {buildings.slice(0, 8).map(b => {
                    const fx = b.effects as Record<string, any> || {};
                    return (
                      <div key={b.id} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-muted/30">
                        <span>{b.name}</span>
                        <div className="flex gap-2 text-muted-foreground font-mono">
                          {Object.entries(fx).map(([k, v]) => (
                            <span key={k}>{k}: {String(v)}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Events */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                <History className="h-3 w-3 text-primary" /> Posledních 10 událostí
              </div>
              {events.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">Žádné relevantní události</div>
              ) : (
                <div className="space-y-1">
                  {events.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded border border-border">
                      <div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 mr-1">{e.event_type}</Badge>
                        <span className="text-muted-foreground">T{e.turn_number}</span>
                      </div>
                      <span className="text-muted-foreground font-mono">{e.id.slice(0, 6)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projection trace */}
            <div>
              <div className="text-xs font-semibold mb-2">Projection Trace</div>
              <div className="text-[10px] text-muted-foreground space-y-0.5 bg-muted/30 p-2 rounded font-mono">
                <div>computed_by: world-tick / process-turn</div>
                <div>last_tick_at: {city?.last_tick_at || "N/A"}</div>
                <div>city_id: {cityId.slice(0, 8)}…</div>
                <div>session_id: {sessionId.slice(0, 8)}…</div>
                <div>buildings_count: {buildings.length}</div>
                <div>events_matched: {events.length}</div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ExplainDrawer;
