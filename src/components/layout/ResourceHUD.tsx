import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users, Gauge,
  ChevronDown, Skull, TrendingUp, Network, Zap, Church
} from "lucide-react";
import { computeWorkforceBreakdown } from "@/lib/economyConstants";
import { MACRO_LAYER_ICONS, STRATEGIC_RESOURCE_ICONS, STRATEGIC_TIER_LABELS, type StrategicResource } from "@/lib/economyFlow";
import DemobilizeDialog from "@/components/DemobilizeDialog";

interface ResourceHUDProps {
  sessionId: string;
  playerName: string;
  cities: any[];
  currentTurn: number;
}

const ResourceHUD = ({ sessionId, playerName, cities, currentTurn }: ResourceHUDProps) => {
  const [realm, setRealm] = useState<any>(null);
  const [showDemobilize, setShowDemobilize] = useState(false);
  const [activeStacks, setActiveStacks] = useState<any[]>([]);
  const [pendingMobRate, setPendingMobRate] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("realm_resources")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();
    if (data) setRealm(data);
  }, [sessionId, playerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const ch = supabase
      .channel(`hud-${sessionId}-${playerName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "realm_resources", filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, playerName, fetchData]);

  const fetchStacks = useCallback(async () => {
    const { data } = await supabase
      .from("military_stacks")
      .select("id, name, formation_type, morale, is_active")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("is_active", true);
    if (!data || data.length === 0) { setActiveStacks([]); return; }
    const { data: comps } = await supabase
      .from("military_stack_composition")
      .select("stack_id, manpower")
      .in("stack_id", data.map(s => s.id));
    const compMap: Record<string, number> = {};
    for (const c of (comps || [])) compMap[c.stack_id] = (compMap[c.stack_id] || 0) + (c.manpower || 0);
    setActiveStacks(data.map(s => ({
      id: s.id, name: s.name, formation_type: s.formation_type, morale: s.morale,
      totalManpower: compMap[s.id] || 0,
    })));
  }, [sessionId, playerName]);

  if (!realm) return null;

  const myCities = cities.filter(c => c.owner_player === playerName);
  const famineCities = myCities.filter(c => c.famine_turn);
  const mobRate = realm.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const computedPool = wf.effectiveActivePop;
  const committed = realm.manpower_committed || 0;
  const availableManpower = computedPool - committed;
  const minMobPct = computedPool > 0 ? Math.ceil((committed / computedPool) * 100) : 0;

  // Macro economy values
  const totalProd = realm.total_production ?? 0;
  const totalWealth = realm.total_wealth ?? 0;
  const totalCap = realm.total_capacity ?? 0;
  const totalImp = realm.total_importance ?? 0;

  // Strategic tiers for display
  const strats = [
    { key: "iron" as StrategicResource, tier: realm.strategic_iron_tier ?? 0 },
    { key: "horses" as StrategicResource, tier: realm.strategic_horses_tier ?? 0 },
    { key: "salt" as StrategicResource, tier: realm.strategic_salt_tier ?? 0 },
    { key: "copper" as StrategicResource, tier: realm.strategic_copper_tier ?? 0 },
    { key: "gold_deposit" as StrategicResource, tier: realm.strategic_gold_tier ?? 0 },
  ].filter(s => s.tier > 0);

  const currentMobPct = Math.round((realm.mobilization_rate || 0.1) * 100);
  const targetCap = pendingMobRate !== null ? Math.floor(computedPool * pendingMobRate) : committed;

  const handleMobilizationChange = async (val: number[]) => {
    const requestedPct = val[0];
    const newCap = Math.floor(computedPool * (requestedPct / 100));
    if (committed > newCap) {
      setPendingMobRate(requestedPct / 100);
      await fetchStacks();
      setShowDemobilize(true);
      return;
    }
    const rate = requestedPct / 100;
    await supabase.from("realm_resources").update({ mobilization_rate: rate }).eq("id", realm.id);
    setRealm((r: any) => ({ ...r, mobilization_rate: rate }));
  };

  const handleDemobilizeDone = async () => {
    if (pendingMobRate !== null) {
      await supabase.from("realm_resources").update({ mobilization_rate: pendingMobRate }).eq("id", realm.id);
      setRealm((r: any) => ({ ...r, mobilization_rate: pendingMobRate }));
      setPendingMobRate(null);
    }
    fetchData();
  };

  // Reserve values (spendable stocks)
  const prodReserve = realm.production_reserve ?? 0;
  const wealthReserve = realm.gold_reserve ?? 0;
  const grainReserve = realm.grain_reserve ?? 0;

  const chips: { icon: React.ReactNode; label: string; value: string; warning?: boolean }[] = [
    {
      icon: <span className="text-xs">{MACRO_LAYER_ICONS.production}</span>,
      label: "Produkce",
      value: `${Math.round(prodReserve)} (+${totalProd.toFixed(0)}/k)`,
    },
    {
      icon: <span className="text-xs">{MACRO_LAYER_ICONS.wealth}</span>,
      label: "Bohatství",
      value: `${Math.round(wealthReserve)} (+${totalWealth.toFixed(0)}/k)`,
    },
    {
      icon: <span className="text-xs">🌾</span>,
      label: "Zásoby",
      value: `${Math.round(grainReserve)}/${realm.granary_capacity ?? 0}`,
      warning: grainReserve < 20,
    },
    {
      icon: <span className="text-xs">{MACRO_LAYER_ICONS.capacity}</span>,
      label: "Kapacita",
      value: totalCap.toFixed(1),
    },
    {
      icon: <Church className="h-3 w-3" />,
      label: "Víra",
      value: (realm.faith ?? 0).toFixed(0),
    },
    {
      icon: <Users className="h-3 w-3" />,
      label: "Muži",
      value: `${availableManpower}/${computedPool}`,
    },
  ];

  return (
    <>
      <div className="bg-secondary/80 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {/* Macro chips */}
        {chips.map(chip => (
          <div
            key={chip.label}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 border transition-colors ${
              chip.warning
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-border bg-card/60 text-foreground hover:border-primary/30 hover:bg-card/80"
            }`}
            title={chip.label}
          >
            <span className={chip.warning ? "" : "text-primary"}>{chip.icon}</span>
            <span className="hidden sm:inline text-muted-foreground">{chip.label}</span>
            <span>{chip.value}</span>
          </div>
        ))}

        {/* Strategic resource badges */}
        {strats.map(s => (
          <div key={s.key} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0 border border-border bg-card/60" title={`${STRATEGIC_TIER_LABELS[s.tier]}`}>
            <span>{STRATEGIC_RESOURCE_ICONS[s.key]}</span>
            <span className="text-muted-foreground hidden sm:inline">{s.tier}</span>
          </div>
        ))}

        {/* Mobilization chip */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 border border-border bg-card/60 hover:border-primary/30 hover:bg-card/80 transition-colors">
          <Gauge className="h-3 w-3 text-primary" />
          <span className="hidden sm:inline text-muted-foreground">Mob</span>
          <span>{currentMobPct}%</span>
        </div>

        {/* Famine indicator */}
        {famineCities.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 border border-destructive/25 bg-destructive/8 text-destructive animate-pulse">
            <Skull className="h-3 w-3" />
            <span>{famineCities.length}× hlad</span>
          </div>
        )}

        {/* Economy detail popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 border border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <h4 className="font-display font-semibold text-sm mb-2 text-primary">Ekonomický přehled</h4>

            {/* Macro layers detail */}
            <div className="space-y-1.5 text-xs mb-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{MACRO_LAYER_ICONS.production} Produkce</span>
                <span className="font-bold">{totalProd.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{MACRO_LAYER_ICONS.wealth} Bohatství</span>
                <span className="font-bold">{totalWealth.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{MACRO_LAYER_ICONS.capacity} Kapacita</span>
                <span className="font-bold">{totalCap.toFixed(1)}</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1">
                <span className="text-muted-foreground">⭐ Importance</span>
                <span className="font-bold">{totalImp.toFixed(1)}</span>
              </div>
            </div>

            {/* Mobilization */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Mobilizace</span>
                <span className="font-semibold">{currentMobPct}%</span>
              </div>
              {minMobPct > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  Min. {minMobPct}% (nasazeno {committed} mužů)
                </div>
              )}
              <Slider
                value={[currentMobPct]}
                onValueCommit={handleMobilizationChange}
                max={30} min={0} step={1}
                className="w-full"
              />
              <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                <span>Muži: {availableManpower} volných</span>
                <span>Odvedení: {committed}</span>
              </div>
            </div>

            {/* Vulnerable cities */}
            {myCities.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-[10px] font-semibold text-muted-foreground">Nejzranitelnější města</h5>
                {[...myCities]
                  .sort((a, b) => (b.vulnerability_score || 0) - (a.vulnerability_score || 0))
                  .slice(0, 3)
                  .map(c => (
                    <div key={c.id} className="flex justify-between text-[10px]">
                      <span className={c.famine_turn ? "text-destructive font-semibold" : ""}>
                        {c.famine_turn && "⚠ "}{c.name}
                      </span>
                      <span className="text-muted-foreground">zranitelnost {(c.vulnerability_score || 0).toFixed(0)}</span>
                    </div>
                  ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <DemobilizeDialog
        open={showDemobilize}
        onClose={() => { setShowDemobilize(false); setPendingMobRate(null); }}
        stacks={activeStacks}
        sessionId={sessionId}
        playerName={playerName}
        currentTurn={currentTurn}
        realmId={realm?.id || ""}
        manpowerCommitted={committed}
        targetCap={targetCap}
        onDone={handleDemobilizeDone}
      />
    </>
  );
};

export default ResourceHUD;
