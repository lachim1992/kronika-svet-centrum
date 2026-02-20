import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown, Castle, Swords, Users, Wheat, AlertTriangle, Flame,
  Shield, MapPin, Landmark, Eye, ArrowUpDown, Skull, BarChart3
} from "lucide-react";
import type { EntityIndex } from "@/hooks/useEntityIndex";

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

type SortKey = "population" | "stability" | "vulnerability" | "settlement";
const SORT_LABELS: Record<SortKey, string> = {
  population: "Populace", stability: "Stabilita", vulnerability: "Zranitelnost", settlement: "Úroveň",
};
const SETTLEMENT_ORDER: Record<string, number> = { POLIS: 4, CITY: 3, TOWNSHIP: 2, HAMLET: 1 };

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  resources: any[];
  armies: any[];
  wonders: any[];
  chronicles: any[];
  worldCrises: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

const HomeTab = ({
  sessionId, cities, currentPlayerName, currentTurn,
  onEntityClick,
}: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [stacks, setStacks] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("population");

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const fetchRealm = useCallback(async () => {
    const [realmRes, stacksRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("military_stacks").select("power")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
    ]);
    if (realmRes.data) setRealm(realmRes.data);
    setStacks(stacksRes.data || []);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchRealm(); }, [fetchRealm]);

  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalPower = stacks.reduce((s, st) => s + (st.power || 0), 0);
  const famineCities = myCities.filter(c => c.famine_turn);

  const sorted = [...myCities].sort((a, b) => {
    switch (sortKey) {
      case "population": return (b.population_total || 0) - (a.population_total || 0);
      case "stability": return (a.city_stability || 70) - (b.city_stability || 70);
      case "vulnerability": return (b.vulnerability_score || 0) - (a.vulnerability_score || 0);
      case "settlement": return (SETTLEMENT_ORDER[b.settlement_level] || 1) - (SETTLEMENT_ORDER[a.settlement_level] || 1);
      default: return 0;
    }
  });

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-2 py-1">
        <Crown className="h-5 w-5 text-illuminated" />
        <h2 className="text-lg font-display font-bold">Moje říše</h2>
        <span className="text-xs text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
      </div>

      {/* SECTION A: Realm Overview Strip */}
      <div className="grid grid-cols-5 gap-2">
        <div className="bg-card rounded-lg border border-border p-2 text-center">
          <Castle className="h-4 w-4 mx-auto text-primary mb-0.5" />
          <div className="text-lg font-bold font-display">{myCities.length}</div>
          <div className="text-[10px] text-muted-foreground">Města</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-2 text-center">
          <Users className="h-4 w-4 mx-auto text-primary mb-0.5" />
          <div className="text-lg font-bold font-display">{totalPop.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Populace</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-2 text-center">
          <Swords className="h-4 w-4 mx-auto text-primary mb-0.5" />
          <div className="text-lg font-bold font-display">{totalPower}</div>
          <div className="text-[10px] text-muted-foreground">Síla</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-2 text-center">
          <BarChart3 className="h-4 w-4 mx-auto text-primary mb-0.5" />
          <div className="text-lg font-bold font-display">{Math.round((realm?.mobilization_rate || 0.1) * 100)}%</div>
          <div className="text-[10px] text-muted-foreground">Mobilizace</div>
        </div>
        <div className={`bg-card rounded-lg border p-2 text-center ${famineCities.length > 0 ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
          <Skull className="h-4 w-4 mx-auto mb-0.5" style={{ color: famineCities.length > 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))" }} />
          <div className="text-lg font-bold font-display">{famineCities.length}</div>
          <div className="text-[10px] text-muted-foreground">Hlad</div>
        </div>
      </div>

      {/* Famine Alerts */}
      {famineCities.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-destructive">Hladomor!</span>
            </div>
            {famineCities.map(c => (
              <button key={c.id} className="text-xs text-destructive hover:underline block"
                onClick={() => onEntityClick?.("city", c.id)}>
                {c.name} — deficit {c.famine_severity}, stabilita {c.city_stability}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION B: Cities List */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm">Města a osady ({myCities.length})</h3>
        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-36 h-7 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {myCities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Castle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground mb-3">Zatím neovládáte žádná sídla.</p>
            <Button size="sm" className="font-display" onClick={() => onEntityClick?.("action", "found_city")}>
              Založit první město
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map(city => {
            const pop = city.population_total || 0;
            const peasantPct = pop > 0 ? Math.round((city.population_peasants || 0) / pop * 100) : 0;
            const burgherPct = pop > 0 ? Math.round((city.population_burghers || 0) / pop * 100) : 0;
            const clericPct = pop > 0 ? Math.round((city.population_clerics || 0) / pop * 100) : 0;
            const grainProd = city.last_turn_grain_prod || 0;
            const grainCons = city.last_turn_grain_cons || 0;
            const grainNet = grainProd - grainCons;
            const dataProcessed = grainProd > 0 || grainCons > 0 || city.population_total > 0;

            return (
              <Card
                key={city.id}
                className={`cursor-pointer hover:border-primary/50 transition-colors ${city.famine_turn ? "border-destructive/50" : ""}`}
                onClick={() => onEntityClick?.("city", city.id)}
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-display font-semibold text-base flex items-center gap-1.5">
                        {city.name}
                        {city.famine_turn && <Flame className="h-3.5 w-3.5 text-destructive" />}
                      </h4>
                      {city.province && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{city.province}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {SETTLEMENT_LABELS[city.settlement_level] || city.settlement_level}
                    </Badge>
                  </div>

                  {dataProcessed ? (
                    <>
                      {/* Population + layers bar */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-muted-foreground">Populace</span>
                          <span className="font-semibold">{pop.toLocaleString()}</span>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                          <div className="bg-primary/70" style={{ width: `${peasantPct}%` }} title={`Rolníci ${peasantPct}%`} />
                          <div className="bg-accent" style={{ width: `${burgherPct}%` }} title={`Měšťané ${burgherPct}%`} />
                          <div className="bg-muted-foreground/40" style={{ width: `${clericPct}%` }} title={`Klerici ${clericPct}%`} />
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                          <span>Rolníci {peasantPct}%</span>
                          <span>Měšťané {burgherPct}%</span>
                          <span>Klerici {clericPct}%</span>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div>
                          <span className="text-muted-foreground">Stabilita</span>
                          <div className={`font-semibold ${city.city_stability < 40 ? "text-destructive" : ""}`}>{city.city_stability}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sýpka</span>
                          <div className="font-semibold">{city.local_grain_reserve || 0}/{city.local_granary_capacity || 0}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Obilí</span>
                          <div className={`font-semibold ${grainNet < 0 ? "text-destructive" : ""}`}>
                            {grainProd} / {grainCons}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Zranitelnost</span>
                          <div className="font-semibold">{(city.vulnerability_score || 0).toFixed(0)}</div>
                        </div>
                      </div>

                      {/* Famine banner */}
                      {city.famine_turn && (
                        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-semibold">
                          <Skull className="h-3 w-3" />
                          Hladomor (deficit {city.famine_severity})
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Data ještě nebyla zpracována. Spusťte kolo.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HomeTab;
