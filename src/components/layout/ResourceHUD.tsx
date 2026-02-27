import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Wheat, Trees, Mountain, Anvil, Zap, Coins, Users, Gauge,
  ChevronDown, Skull
} from "lucide-react";
import { computeWealthIncome, computeWorkforceBreakdown } from "@/lib/economyConstants";
import DemobilizeDialog from "@/components/DemobilizeDialog";

interface ResourceHUDProps {
  sessionId: string;
  playerName: string;
  cities: any[];
  currentTurn: number;
}

const ResourceHUD = ({ sessionId, playerName, cities, currentTurn }: ResourceHUDProps) => {
  const [realm, setRealm] = useState<any>(null);
  const [playerRes, setPlayerRes] = useState<Record<string, any>>({});
  const [showDemobilize, setShowDemobilize] = useState(false);
  const [activeStacks, setActiveStacks] = useState<any[]>([]);
  const [pendingMobRate, setPendingMobRate] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const [realmRes, prRes] = await Promise.all([
      supabase
        .from("realm_resources")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle(),
      supabase
        .from("player_resources")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName),
    ]);
    if (realmRes.data) setRealm(realmRes.data);
    const map: Record<string, any> = {};
    for (const r of (prRes.data || [])) map[r.resource_type] = r;
    setPlayerRes(map);
  }, [sessionId, playerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const ch = supabase
      .channel(`hud-${sessionId}-${playerName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "realm_resources", filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_resources", filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, playerName, fetchData]);

  // Fetch active stacks for demobilize dialog
  const fetchStacks = useCallback(async () => {
    const { data } = await supabase
      .from("military_stacks")
      .select("id, name, formation_type, morale, is_active")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("is_active", true);

    if (!data || data.length === 0) { setActiveStacks([]); return; }

    // Fetch compositions
    const { data: comps } = await supabase
      .from("military_stack_composition")
      .select("stack_id, manpower")
      .in("stack_id", data.map(s => s.id));

    const compMap: Record<string, number> = {};
    for (const c of (comps || [])) {
      compMap[c.stack_id] = (compMap[c.stack_id] || 0) + (c.manpower || 0);
    }

    setActiveStacks(data.map(s => ({
      id: s.id,
      name: s.name,
      formation_type: s.formation_type,
      morale: s.morale,
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

  // Calculate minimum mobilization % based on committed troops
  const minMobPct = computedPool > 0
    ? Math.ceil((committed / computedPool) * 100)
    : 0;

  const getRes = (type: string) => {
    const r = playerRes[type];
    const income = r?.income || 0;
    const upkeep = r?.upkeep || 0;
    const stockpile = r?.stockpile || 0;
    return { income, upkeep, net: income - upkeep, stockpile };
  };

  const wood = getRes("wood");

  // Grain: compute from city-level data to avoid buffer confusion
  const cityGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
  const grainBuffer = myCities.length <= 3 ? 10 : 0;
  const grainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
  const grainTotalIncome = cityGrainProd + grainBuffer;
  const grainNet = grainTotalIncome - grainCons;
  const grainStock = realm.grain_reserve ?? getRes("food").stockpile ?? 0;

  // Stone: base resource from all cities
  const stoneIncome = myCities.reduce((s, c) => s + (c.last_turn_stone_prod || 0), 0);
  const stoneStock = getRes("stone").stockpile;

  // Iron: special resource from some cities
  const ironIncome = myCities.reduce((s, c) => s + (c.last_turn_iron_prod || 0), 0);
  const ironStock = getRes("iron").stockpile;

  // Compute wealth client-side using shared formula
  const computedWealthIncome = computeWealthIncome(myCities);
  const wealth = getRes("wealth");
  const wealthNet = (computedWealthIncome > 0 ? computedWealthIncome : wealth.income) - wealth.upkeep;
  const wealthStock = realm.gold_reserve ?? wealth.stockpile ?? 0;

  const grainCapacity = realm.granary_capacity || 500;

  const chips: { icon: React.ReactNode; label: string; value: string; warning?: boolean }[] = [
    {
      icon: <Wheat className="h-3 w-3" />,
      label: "Obilí",
      value: `${grainNet >= 0 ? "+" : ""}${grainNet} · ${grainStock}/${grainCapacity}`,
      warning: grainNet < 0,
    },
    { icon: <Trees className="h-3 w-3" />, label: "Dřevo", value: `+${wood.net} · ${wood.stockpile}` },
    { icon: <Mountain className="h-3 w-3" />, label: "Kámen", value: `+${stoneIncome} · ${stoneStock}` },
    { icon: <Anvil className="h-3 w-3" />, label: "Železo", value: `+${ironIncome} · ${ironStock}` },
    { icon: <Zap className="h-3 w-3" />, label: "Koně", value: `${realm.horses_reserve || 0}/${realm.stables_capacity || 100}` },
    { icon: <Coins className="h-3 w-3" />, label: "Zlato", value: `${wealthNet >= 0 ? "+" : ""}${wealthNet} · ${wealthStock}` },
    {
      icon: <Users className="h-3 w-3" />,
      label: "Muži",
      value: `${availableManpower}/${computedPool}`,
    },
  ];

  const targetCap = pendingMobRate !== null ? Math.floor(computedPool * pendingMobRate) : committed;

  const handleMobilizationChange = async (val: number[]) => {
    const requestedPct = val[0];
    const newCap = Math.floor(computedPool * (requestedPct / 100));

    // If committed troops exceed the new cap, force demobilize
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
    // After demobilize completes, apply the pending mobilization rate
    if (pendingMobRate !== null) {
      await supabase.from("realm_resources").update({ mobilization_rate: pendingMobRate }).eq("id", realm.id);
      setRealm((r: any) => ({ ...r, mobilization_rate: pendingMobRate }));
      setPendingMobRate(null);
    }
    fetchData();
  };

  const grainPct = Math.min(100, (grainStock / Math.max(1, grainCapacity)) * 100);

  const currentMobPct = Math.round((realm.mobilization_rate || 0.1) * 100);

  return (
    <>
      <div className="bg-secondary/80 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {/* Resource chips */}
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

            <div className="space-y-1 text-xs mb-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Produkce sídel</span><span className="font-semibold">{cityGrainProd}</span></div>
              {grainBuffer > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bonus malé říše</span><span className="font-semibold text-primary">+{grainBuffer}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Spotřeba</span><span className="font-semibold">{grainCons}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bilance</span><span className={`font-semibold ${grainNet < 0 ? "text-destructive" : "text-primary"}`}>{grainNet >= 0 ? "+" : ""}{grainNet}</span></div>
              <div className="w-full bg-muted rounded h-1.5 mt-1">
                <div className="bg-primary rounded h-1.5 transition-all" style={{ width: `${grainPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Zásoby: {grainStock}</span>
                <span>Kapacita: {grainCapacity}</span>
              </div>
            </div>

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

      {/* Demobilize dialog */}
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
