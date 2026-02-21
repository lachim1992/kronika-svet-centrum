import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Wheat, Trees, Mountain, Anvil, Zap, Coins, Users, Gauge,
  ChevronDown, Skull
} from "lucide-react";

interface ResourceHUDProps {
  sessionId: string;
  playerName: string;
  cities: any[];
}

const ResourceHUD = ({ sessionId, playerName, cities }: ResourceHUDProps) => {
  const [realm, setRealm] = useState<any>(null);
  const [playerRes, setPlayerRes] = useState<Record<string, any>>({});

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
        .ilike("player_name", playerName),
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

  if (!realm) return null;

  const myCities = cities.filter(c => c.owner_player === playerName);
  const famineCities = myCities.filter(c => c.famine_turn);
  const availableManpower = (realm.manpower_pool || 0) - (realm.manpower_committed || 0);

  // Derive resource values from player_resources (canonical source)
  const getRes = (type: string) => {
    const r = playerRes[type];
    const income = r?.income || 0;
    const upkeep = r?.upkeep || 0;
    const stockpile = r?.stockpile || 0;
    return { net: income - upkeep, stockpile };
  };

  const food = getRes("food");
  const wood = getRes("wood");
  const stone = getRes("stone");
  const iron = getRes("iron");

  const grainCapacity = realm.granary_capacity || 500;

  const chips: { icon: React.ReactNode; label: string; value: string; warning?: boolean }[] = [
    {
      icon: <Wheat className="h-3 w-3" />,
      label: "Obilí",
      value: `${food.net >= 0 ? "+" : ""}${food.net} · ${food.stockpile}/${grainCapacity}`,
      warning: food.net < 0,
    },
    { icon: <Trees className="h-3 w-3" />, label: "Dřevo", value: `+${wood.net} · ${wood.stockpile}` },
    { icon: <Mountain className="h-3 w-3" />, label: "Kámen", value: `+${stone.net} · ${stone.stockpile}` },
    { icon: <Anvil className="h-3 w-3" />, label: "Železo", value: `+${iron.net} · ${iron.stockpile}` },
    { icon: <Zap className="h-3 w-3" />, label: "Koně", value: `${realm.horses_reserve || 0}/${realm.stables_capacity || 100}` },
    { icon: <Coins className="h-3 w-3" />, label: "Zlato", value: `${realm.gold_reserve || 0}` },
    {
      icon: <Users className="h-3 w-3" />,
      label: "Muži",
      value: `${availableManpower}/${realm.manpower_pool || 0}`,
    },
  ];

  const handleMobilizationChange = async (val: number[]) => {
    const rate = val[0] / 100;
    await supabase.from("realm_resources").update({ mobilization_rate: rate }).eq("id", realm.id);
    setRealm((r: any) => ({ ...r, mobilization_rate: rate }));
  };

  const grainPct = Math.min(100, (food.stockpile / Math.max(1, grainCapacity)) * 100);

  return (
    <div className="bg-card/90 backdrop-blur-sm border-b border-border px-3 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {/* Resource chips */}
      {chips.map(chip => (
        <div
          key={chip.label}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border ${
            chip.warning ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/50 text-foreground"
          }`}
          title={chip.label}
        >
          {chip.icon}
          <span className="hidden sm:inline">{chip.label}</span>
          <span>{chip.value}</span>
        </div>
      ))}

      {/* Mobilization chip */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border border-border bg-muted/50">
        <Gauge className="h-3 w-3" />
        <span className="hidden sm:inline">Mob</span>
        <span>{Math.round((realm.mobilization_rate || 0.1) * 100)}%</span>
      </div>

      {/* Famine indicator */}
      {famineCities.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border border-destructive/40 bg-destructive/10 text-destructive">
          <Skull className="h-3 w-3" />
          <span>{famineCities.length}× hlad</span>
        </div>
      )}

      {/* Economy detail popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <h4 className="font-display font-semibold text-sm mb-2">Ekonomický přehled</h4>

          {/* Grain breakdown */}
          <div className="space-y-1 text-xs mb-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Produkce obilí</span><span className="font-semibold">{playerRes.food?.income || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Spotřeba obilí</span><span className="font-semibold">{playerRes.food?.upkeep || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bilance</span><span className={`font-semibold ${food.net < 0 ? "text-destructive" : "text-accent"}`}>{food.net >= 0 ? "+" : ""}{food.net}</span></div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${grainPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Zásoby: {food.stockpile}</span>
              <span>Kapacita: {grainCapacity}</span>
            </div>
          </div>

          {/* Mobilization slider */}
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Mobilizace</span>
              <span className="font-semibold">{Math.round((realm.mobilization_rate || 0.1) * 100)}%</span>
            </div>
            <Slider
              value={[Math.round((realm.mobilization_rate || 0.1) * 100)]}
              onValueCommit={handleMobilizationChange}
              max={30} min={0} step={1}
              className="w-full"
            />
            <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <span>Muži: {availableManpower} volných</span>
              <span>Odvedení: {realm.manpower_committed || 0}</span>
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
  );
};

export default ResourceHUD;
