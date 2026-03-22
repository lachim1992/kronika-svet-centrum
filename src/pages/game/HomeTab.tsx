import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import CityManagement from "@/components/CityManagement";
import VictoryProgressPanel from "@/components/VictoryProgressPanel";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown, Castle, Swords, Users, Wheat, Flame,
  MapPin, Eye, ArrowUpDown, Skull, BarChart3,
  Trees, Mountain, Anvil, Plus, Cpu
} from "lucide-react";
import type { EntityIndex } from "@/hooks/useEntityIndex";
import ProvinceOnboardingWizard from "@/components/ProvinceOnboardingWizard";
import { toast } from "sonner";
import { useDevMode } from "@/hooks/useDevMode";
import ExplainDrawer from "@/components/dev/ExplainDrawer";
import RealmIndicators from "@/components/realm/RealmIndicators";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";

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
  onRefetch?: () => void;
  onFoundCity?: () => void;
}

const HomeTab = ({
  sessionId, session, cities, players, currentPlayerName, currentTurn, myRole,
  onEntityClick, onRefetch, onFoundCity,
}: Props) => {
  const isMultiplayer = session?.game_mode === "tb_multi";
  const [realm, setRealm] = useState<any>(null);
  const [stacks, setStacks] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("population");
  const [managingCityId, setManagingCityId] = useState<string | null>(null);
  const [hasProvince, setHasProvince] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeWars, setActiveWars] = useState<any[]>([]);
  const [explainTarget, setExplainTarget] = useState<{ metric: "population" | "grain_cap"; cityId: string } | null>(null);
  const { devMode } = useDevMode();

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const fetchRealm = useCallback(async () => {
    const [realmRes, stacksRes, provRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("military_stacks").select("power")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("provinces").select("id, name")
        .eq("session_id", sessionId).eq("owner_player", currentPlayerName),
    ]);
    if (realmRes.data) setRealm(realmRes.data);
    setStacks(stacksRes.data || []);
    const provs = provRes.data || [];
    const playerHasProvince = provs.length > 0;
    setHasProvince(playerHasProvince);
    // Show onboarding for non-admin players with no province and no cities
    if (!playerHasProvince && myRole !== "admin" && myCities.length === 0) {
      setShowOnboarding(true);
    }
  }, [sessionId, currentPlayerName, myRole, myCities.length]);

  // Turn button removed — unified in AppHeader via commit-turn

  useEffect(() => { fetchRealm(); }, [fetchRealm]);

  useEffect(() => {
    const fetchWars = async () => {
      const { data } = await supabase.from("war_declarations")
        .select("*")
        .eq("session_id", sessionId)
        .in("status", ["active", "peace_offered"]);
      setActiveWars((data || []).filter((w: any) =>
        w.declaring_player === currentPlayerName || w.target_player === currentPlayerName
      ));
    };
    fetchWars();
  }, [sessionId, currentPlayerName, currentTurn]);

  // No more foundCityTrigger — founding is handled by the unified dialog in Dashboard

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

  // Show onboarding wizard for new players
  if (showOnboarding && hasProvince === false && myRole !== "admin") {
    return (
      <div className="space-y-6 pb-24 px-1">
        <div className="flex items-center gap-3 pt-2">
          <Crown className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-display font-bold">Vítejte ve světě!</h2>
          <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        </div>
        <ProvinceOnboardingWizard
          sessionId={sessionId}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          onComplete={() => { setShowOnboarding(false); fetchRealm(); onRefetch?.(); }}
        />
      </div>
    );
  }

  // City Management inline view
  if (managingCityId) {
    return (
      <div className="pb-24 px-1">
        <CityManagement
          sessionId={sessionId}
          cityId={managingCityId}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          onBack={() => { setManagingCityId(null); onRefetch?.(); }}
          onRefetch={onRefetch}
        />
      </div>
    );
  }



  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Crown className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Moje říše</h2>
        <span className="text-sm text-muted-foreground font-display">Rok {currentTurn}</span>
      </div>

      {/* Active Wars Banner */}
      {activeWars.length > 0 && (
        <div className="game-card border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Swords className="h-5 w-5 text-destructive" />
            <span className="font-display font-bold text-destructive">Aktivní konflikty!</span>
          </div>
          <div className="space-y-1">
            {activeWars.map((w: any) => {
              const opponent = w.declaring_player === currentPlayerName ? w.target_player : w.declaring_player;
              const turns = currentTurn - (w.declared_turn || 0);
              return (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Swords className="h-3.5 w-3.5 text-destructive" />
                    <span className="font-semibold">{opponent}</span>
                    {w.status === "peace_offered" && (
                      <Badge variant="outline" className="text-[10px] ml-1">🕊️ Mírová nabídka</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{turns} kol</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Victory Progress */}
      <VictoryProgressPanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
      />

      {/* Onboarding Checklist */}
      <OnboardingChecklist
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        cities={myCities}
        armies={stacks}
        onTabChange={(tab) => {/* handled by parent */}}
        onDismiss={() => {}}
      />

      {/* Realm Indicators — demographics, economy, projections, stability */}
      <RealmIndicators realm={realm} cities={myCities} currentTurn={currentTurn} />

      {/* Laws & Decrees */}
      <RealmLawsDecrees sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />

      {/* Famine Alerts */}
      {famineCities.length > 0 && (
        <div className="game-card border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <Flame className="h-5 w-5 text-destructive" />
            <span className="text-base font-display font-semibold text-destructive">Hladomor!</span>
          </div>
          {famineCities.map(c => (
            <button key={c.id} className="text-sm text-destructive hover:underline block py-0.5"
              onClick={() => onEntityClick?.("city", c.id)}>
              {c.name} — deficit {c.famine_severity}, stabilita {c.city_stability}
            </button>
          ))}
        </div>
      )}

      {/* Cities List Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-base">Města a osady ({myCities.length})</h3>
        <div className="flex items-center gap-2">
          {hasProvince && (
            <Button size="sm" variant="outline" className="font-display text-xs" onClick={() => onFoundCity?.()}>
              <Plus className="h-3 w-3 mr-1" />Založit osadu
            </Button>
          )}
          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state */}
      {myCities.length === 0 ? (
        <div className="game-card p-10 text-center">
          <Castle className="h-14 w-14 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-base text-muted-foreground mb-4">Zatím neovládáte žádná sídla.</p>
          {myRole === "admin" ? (
            <Button size="lg" className="font-display" onClick={() => onFoundCity?.()}>
              Založit první město
            </Button>
          ) : (
            <Button size="lg" className="font-display" onClick={() => setShowOnboarding(true)}>
              Založit provincii a osadu
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
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
              <div
                key={city.id}
                className={`game-card p-5 cursor-pointer ${city.famine_turn ? "border-destructive/40" : ""}`}
                onClick={() => setManagingCityId(city.id)}
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-display font-semibold text-lg flex items-center gap-2">
                      {city.name}
                      {city.famine_turn && <Flame className="h-4 w-4 text-destructive" />}
                    </h4>
                    {city.province && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3.5 w-3.5" />{city.province}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0 px-2.5 py-1">
                    {SETTLEMENT_LABELS[city.settlement_level] || city.settlement_level}
                  </Badge>
                </div>

                {dataProcessed ? (
                  <>
                    {/* Population bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Populace</span>
                        <div className="flex items-center gap-1">
                          {devMode && (
                            <button onClick={(e) => { e.stopPropagation(); setExplainTarget({ metric: "population", cityId: city.id }); }}
                              className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="Explain population">
                              <Cpu className="h-2.5 w-2.5 inline mr-0.5" />Proč?
                            </button>
                          )}
                          <span className="font-semibold text-base">{pop.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
                        <div className="bg-primary/70 transition-all" style={{ width: `${peasantPct}%` }} title={`Rolníci ${peasantPct}%`} />
                        <div className="bg-accent transition-all" style={{ width: `${burgherPct}%` }} title={`Měšťané ${burgherPct}%`} />
                        <div className="bg-muted-foreground/40 transition-all" style={{ width: `${clericPct}%` }} title={`Klerici ${clericPct}%`} />
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Rolníci {peasantPct}%</span>
                        <span>Měšťané {burgherPct}%</span>
                        <span>Klerici {clericPct}%</span>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-3 text-xs mb-3">
                      <div>
                        <span className="stat-label">Stabilita</span>
                        <div className={`text-lg font-bold font-display ${city.city_stability < 40 ? "text-destructive" : "text-foreground"}`}>{city.city_stability}</div>
                      </div>
                      <div>
                        <span className="stat-label">Produkce</span>
                        <div className={`text-lg font-bold font-display ${(city.last_turn_grain_prod || 0) - (city.last_turn_grain_cons || 0) < 0 ? "text-destructive" : "text-foreground"}`}>
                          {(city.last_turn_grain_prod || 0) - (city.last_turn_grain_cons || 0) >= 0 ? "+" : ""}{(city.last_turn_grain_prod || 0) - (city.last_turn_grain_cons || 0)} 🌾
                        </div>
                      </div>
                      <div>
                        <span className="stat-label flex items-center gap-1">
                          Obilí
                          {devMode && (
                            <button onClick={(e) => { e.stopPropagation(); setExplainTarget({ metric: "grain_cap", cityId: city.id }); }}
                              className="text-[8px] px-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                              title="Explain grain cap">?</button>
                          )}
                        </span>
                        <div className={`text-lg font-bold font-display ${grainNet < 0 ? "text-destructive" : "text-success"}`}>
                          {grainNet >= 0 ? "+" : ""}{grainNet}
                        </div>
                      </div>
                      <div>
                        <span className="stat-label">Zranitelnost</span>
                        <div className="text-lg font-bold font-display">{(city.vulnerability_score || 0).toFixed(0)}</div>
                      </div>
                    </div>

                    {/* Production row */}
                    <div className="flex items-center gap-4 text-sm px-3 py-2 rounded-lg bg-muted/40">
                      <span className="text-muted-foreground font-semibold text-xs">Produkce:</span>
                      <span className="flex items-center gap-1"><Wheat className="h-3.5 w-3.5 text-primary" />+{grainProd}</span>
                      <span className="flex items-center gap-1 text-orange-400">⚒️ +{(city.last_turn_wood_prod || 0) + (city.last_turn_stone_prod || 0) + (city.last_turn_iron_prod || 0)}</span>
                      {city.special_resource_type && city.special_resource_type !== "NONE" && (
                        <span className="flex items-center gap-1 text-amber-400">✦ {city.special_resource_type}</span>
                      )}
                    </div>

                    {/* Famine banner */}
                    {city.famine_turn && (
                      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold">
                        <Skull className="h-4 w-4" />
                        Hladomor (deficit {city.famine_severity})
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Data ještě nebyla zpracována. Spusťte kolo.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {explainTarget && (
        <ExplainDrawer
          open={!!explainTarget}
          onClose={() => setExplainTarget(null)}
          metric={explainTarget.metric}
          cityId={explainTarget.cityId}
          sessionId={sessionId}
        />
      )}
    </div>
  );
};

export default HomeTab;
