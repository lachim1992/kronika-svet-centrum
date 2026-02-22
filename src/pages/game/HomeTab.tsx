import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown, Castle, Swords, Users, Wheat, Flame,
  MapPin, Eye, ArrowUpDown, Skull, BarChart3,
  Trees, Mountain, Anvil, Plus, Loader2, Play
} from "lucide-react";
import type { EntityIndex } from "@/hooks/useEntityIndex";
import ProvinceOnboardingWizard from "@/components/ProvinceOnboardingWizard";
import { toast } from "sonner";
import { closeTurnForPlayer, advanceTurn } from "@/hooks/useGameSession";
import { runWorldTick } from "@/lib/ai";

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
  foundCityTrigger?: number;
}

const HomeTab = ({
  sessionId, session, cities, players, currentPlayerName, currentTurn, myRole,
  onEntityClick, onRefetch, foundCityTrigger,
}: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [stacks, setStacks] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("population");
  const [hasProvince, setHasProvince] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCreateSettlement, setShowCreateSettlement] = useState(false);
  const [playerProvinces, setPlayerProvinces] = useState<any[]>([]);
  const [processingTurn, setProcessingTurn] = useState(false);

  const isAIMode = session?.game_mode === "tb_single_ai";
  const currentPlayer = players?.find((p: any) => p.player_name === currentPlayerName);

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
    setPlayerProvinces(provs);
    const playerHasProvince = provs.length > 0;
    setHasProvince(playerHasProvince);
    // Show onboarding for non-admin players with no province and no cities
    if (!playerHasProvince && myRole !== "admin" && myCities.length === 0) {
      setShowOnboarding(true);
    }
  }, [sessionId, currentPlayerName, myRole, myCities.length]);

  const handleNextTurn = useCallback(async () => {
    if (!currentPlayer || processingTurn) return;
    setProcessingTurn(true);
    try {
      // 1. Close player's turn
      await closeTurnForPlayer(sessionId, currentPlayer.player_number);

      // 2. Run world tick
      try {
        const tickResult = await runWorldTick(sessionId, currentTurn);
        if (tickResult.ok) {
          const r = tickResult.results || {};
          const growthCount = r.settlement_growth?.length || 0;
          const tensionCrises = (r.tensions || []).filter((t: any) => t.crisis_triggered).length;
          toast.info(`⚙️ World Tick: ${growthCount} měst rostlo, ${tensionCrises} krizí.`);
        } else if (tickResult.alreadyProcessed) {
          toast.info("⚙️ World Tick pro toto kolo již proběhl.");
        }
      } catch (e) {
        console.error("World tick error:", e);
      }

      // 3. Process AI factions (if AI mode)
      if (isAIMode) {
        try {
          const { data: aiFactions } = await supabase.from("ai_factions")
            .select("faction_name")
            .eq("session_id", sessionId)
            .eq("is_active", true);
          if (aiFactions && aiFactions.length > 0) {
            let aiCount = 0;
            for (const faction of aiFactions) {
              try {
                await supabase.functions.invoke("ai-faction-turn", {
                  body: { sessionId, factionName: faction.faction_name },
                });
                aiCount++;
              } catch (e) { console.error(`AI faction ${faction.faction_name} error:`, e); }
            }
            if (aiCount > 0) toast.info(`${aiCount} AI frakcí provedlo svůj tah.`);
          }
        } catch (e) { console.error("AI faction error:", e); }
      }

      // 4. Turn summary
      await supabase.from("turn_summaries").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: currentPlayerName,
      });

      // 5. Advance turn
      await advanceTurn(sessionId, currentTurn);

      // 6. Compress history (AI mode, background)
      if (isAIMode) {
        try {
          const { data: sess } = await supabase.from("game_sessions")
            .select("tier").eq("id", sessionId).single();
          await supabase.functions.invoke("ai-compress-history", {
            body: { sessionId, currentTurn: currentTurn + 1, tier: sess?.tier || "free" },
          });
        } catch (e) { console.error("History compression error:", e); }
      }

      toast.success(`Kolo ${currentTurn} uzavřeno. Pokračujeme rokem ${currentTurn + 1}.`);
      onRefetch?.();
      fetchRealm();
    } catch (e) {
      console.error("Next turn error:", e);
      toast.error("Chyba při zpracování kola.");
    } finally {
      setProcessingTurn(false);
    }
  }, [sessionId, currentTurn, currentPlayer, currentPlayerName, isAIMode, processingTurn, fetchRealm, onRefetch]);

  useEffect(() => { fetchRealm(); }, [fetchRealm]);

  // Handle found_city trigger from FAB/Dashboard
  useEffect(() => {
    if (!foundCityTrigger || foundCityTrigger === 0) return;
    if (hasProvince === null) return; // still loading
    if (!hasProvince) {
      // No province → show onboarding
      setShowOnboarding(true);
    } else {
      // Has province → show create settlement form
      setShowCreateSettlement(true);
    }
  }, [foundCityTrigger, hasProvince]);

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

  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Crown className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Moje říše</h2>
        <span className="text-sm text-muted-foreground font-display">Rok {currentTurn}</span>
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={handleNextTurn}
            disabled={processingTurn}
            className="font-display"
          >
            {processingTurn ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Zpracovávám…</>
            ) : (
              <><Play className="mr-1.5 h-3.5 w-3.5" />Další kolo</>
            )}
          </Button>
        </div>
      </div>

      {/* Realm Overview Strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { icon: Castle, value: myCities.length, label: "Města", color: "text-primary" },
          { icon: Users, value: totalPop.toLocaleString(), label: "Populace", color: "text-primary" },
          { icon: Swords, value: totalPower, label: "Síla", color: "text-primary" },
          { icon: BarChart3, value: `${Math.round((realm?.mobilization_rate || 0.1) * 100)}%`, label: "Mobilizace", color: "text-primary" },
          { icon: Skull, value: famineCities.length, label: "Hlad", color: famineCities.length > 0 ? "text-destructive" : "text-primary", danger: famineCities.length > 0 },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className={`game-card p-4 text-center ${stat.danger ? "border-destructive/40 bg-destructive/5" : ""}`}
            >
              <Icon className={`h-5 w-5 mx-auto mb-2 ${stat.color}`} />
              <div className="stat-number">{stat.value}</div>
              <div className="stat-label mt-1">{stat.label}</div>
            </div>
          );
        })}
      </div>

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
            <Button size="sm" variant="outline" className="font-display text-xs" onClick={() => setShowCreateSettlement(true)}>
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

      {/* Inline Create Settlement Form */}
      {showCreateSettlement && <CreateSettlementForm
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        provinces={playerProvinces}
        onCreated={(cityId) => {
          setShowCreateSettlement(false);
          fetchRealm();
          onRefetch?.();
          onEntityClick?.("city", cityId);
        }}
        onCancel={() => setShowCreateSettlement(false)}
      />}

      {/* Empty state */}
      {myCities.length === 0 ? (
        <div className="game-card p-10 text-center">
          <Castle className="h-14 w-14 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-base text-muted-foreground mb-4">Zatím neovládáte žádná sídla.</p>
          {myRole === "admin" ? (
            <Button size="lg" className="font-display" onClick={() => onEntityClick?.("action", "found_city")}>
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
                onClick={() => onEntityClick?.("city", city.id)}
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
                        <span className="font-semibold text-base">{pop.toLocaleString()}</span>
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
                        <span className="stat-label">Sýpka</span>
                        <div className="text-lg font-bold font-display">{city.local_grain_reserve || 0}<span className="text-sm text-muted-foreground">/{city.local_granary_capacity || 0}</span></div>
                      </div>
                      <div>
                        <span className="stat-label">Obilí</span>
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
                      <span className="flex items-center gap-1"><Trees className="h-3.5 w-3.5 text-primary" />+{city.last_turn_wood_prod || 0}</span>
                      {city.special_resource_type === "STONE" && (
                        <span className="flex items-center gap-1"><Mountain className="h-3.5 w-3.5 text-primary" />+{city.last_turn_special_prod || 0}</span>
                      )}
                      {city.special_resource_type === "IRON" && (
                        <span className="flex items-center gap-1"><Anvil className="h-3.5 w-3.5 text-primary" />+{city.last_turn_special_prod || 0}</span>
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
    </div>
  );
};

/* ─── Inline Settlement Creation Form ─── */

function CreateSettlementForm({ sessionId, currentPlayerName, currentTurn, provinces, onCreated, onCancel }: {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  provinces: { id: string; name: string }[];
  onCreated: (cityId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [provinceId, setProvinceId] = useState(provinces[0]?.id || "");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Zadejte název osady"); return; }
    if (!provinceId) { toast.error("Vyberte provincii"); return; }

    const selectedProvince = provinces.find(p => p.id === provinceId);
    setCreating(true);
    try {
      const { data, error } = await supabase.from("cities").insert({
        session_id: sessionId,
        owner_player: currentPlayerName,
        name: name.trim(),
        province_id: provinceId,
        province: selectedProvince?.name || "",
        level: "Osada",
        settlement_level: "HAMLET",
        founded_round: currentTurn,
      }).select("id").single();

      if (error) throw error;

      // Auto-discover province and city + all sibling cities in that province
      const discoveryRows: any[] = [
        { session_id: sessionId, player_name: currentPlayerName, entity_type: "city", entity_id: data.id, source: "founded" },
        { session_id: sessionId, player_name: currentPlayerName, entity_type: "province", entity_id: provinceId, source: "founded" },
      ];
      // Also discover the province's region
      const { data: prov } = await supabase.from("provinces").select("region_id").eq("id", provinceId).single();
      if (prov?.region_id) {
        discoveryRows.push({ session_id: sessionId, player_name: currentPlayerName, entity_type: "region", entity_id: prov.region_id, source: "founded" });
      }
      // Discover all existing cities in the same province
      const { data: siblingCities } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("province_id", provinceId).neq("id", data.id);
      if (siblingCities) {
        for (const sc of siblingCities) {
          discoveryRows.push({ session_id: sessionId, player_name: currentPlayerName, entity_type: "city", entity_id: sc.id, source: "founded" });
        }
      }
      await supabase.from("discoveries").upsert(discoveryRows, { onConflict: "session_id,player_name,entity_type,entity_id" });

      toast.success(`Osada ${name.trim()} založena!`);
      onCreated(data.id);
    } catch (err: any) {
      console.error(err);
      toast.error("Chyba: " + (err.message || "Nepodařilo se založit osadu"));
    }
    setCreating(false);
  };

  return (
    <div className="game-card p-5 space-y-4 border-primary/30">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Castle className="h-4 w-4 text-primary" />
        Založit novou osadu
      </h3>
      <div className="space-y-3">
        <Input
          placeholder="Název osady"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        {provinces.length > 1 ? (
          <Select value={provinceId} onValueChange={setProvinceId}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Vyberte provincii" /></SelectTrigger>
            <SelectContent>
              {provinces.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">Provincie: <strong>{provinces[0]?.name}</strong></p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={creating || !name.trim()} className="font-display flex-1">
          {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám...</> : "Založit osadu"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="font-display">Zrušit</Button>
      </div>
    </div>
  );
}

export default HomeTab;
