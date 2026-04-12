import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Loader2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import GoodsDemandSubTab from "./GoodsDemandSubTab";
import { DEMAND_BASKETS } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  playerName: string;
  cities: any[];
}

interface CityBasketRow {
  city_id: string;
  basket_key: string;
  auto_supply: number;
  bonus_supply: number;
  local_demand: number;
  local_supply: number;
  domestic_satisfaction: number;
  export_surplus: number;
  turn_number: number;
}

const LAYER_META: Record<string, { label: string; icon: string; color: string; desc: string; keys: string[] }> = {
  need: {
    label: "NEED — Přežití", icon: "🔴", color: "bg-destructive",
    desc: "Základní potřeby. Nesaturace → destabilizace a hladomor.",
    keys: ["staple_food", "basic_material", "tools"],
  },
  upgrade: {
    label: "UPGRADE — Růst", icon: "🟡", color: "bg-amber-500",
    desc: "Civilizační růst. Nesaturace → stagnace rozvoje.",
    keys: ["construction", "textile", "military_supply"],
  },
  prestige: {
    label: "PRESTIGE — Luxus", icon: "🔵", color: "bg-blue-500",
    desc: "Kulturní síla. Nesaturace → ztráta prestiže.",
    keys: ["variety", "ritual", "feast", "prestige"],
  },
};

function getLayerForBasket(bk: string): string {
  for (const [layer, meta] of Object.entries(LAYER_META)) {
    if (meta.keys.includes(bk)) return layer;
  }
  return "need";
}

const DemandFulfillmentPanel = ({ sessionId, playerName, cities }: Props) => {
  const [baskets, setBaskets] = useState<CityBasketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("city_market_baskets")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .order("turn_number", { ascending: false })
        .limit(500);

      const rows = (data || []) as CityBasketRow[];
      const maxTurn = rows.reduce((m, r) => Math.max(m, r.turn_number), 0);
      setBaskets(rows.filter(r => r.turn_number === maxTurn));
      setLoading(false);
    };
    fetch();
  }, [sessionId, playerName]);

  const basketMeta = useMemo(() => {
    const map = new Map<string, { label: string; icon: string }>();
    for (const b of DEMAND_BASKETS) map.set(b.key, { label: b.label, icon: b.icon });
    return map;
  }, []);

  // Aggregate by basket across all cities
  const byBasket = useMemo(() => {
    const map: Record<string, { demand: number; supply: number; auto: number; bonus: number; surplus: number; count: number }> = {};
    for (const b of baskets) {
      if (!map[b.basket_key]) map[b.basket_key] = { demand: 0, supply: 0, auto: 0, bonus: 0, surplus: 0, count: 0 };
      map[b.basket_key].demand += b.local_demand;
      map[b.basket_key].supply += b.local_supply;
      map[b.basket_key].auto += b.auto_supply;
      map[b.basket_key].bonus += b.bonus_supply;
      map[b.basket_key].surplus += b.export_surplus;
      map[b.basket_key].count++;
    }
    return map;
  }, [baskets]);

  // Aggregate by layer
  const layers = useMemo(() => {
    const map: Record<string, { demand: number; supply: number; count: number }> = {};
    for (const [bk, data] of Object.entries(byBasket)) {
      const layer = getLayerForBasket(bk);
      if (!map[layer]) map[layer] = { demand: 0, supply: 0, count: 0 };
      map[layer].demand += data.demand;
      map[layer].supply += data.supply;
      map[layer].count += data.count;
    }
    return map;
  }, [byBasket]);

  // Sort baskets by gap
  const sortedBaskets = useMemo(() =>
    Object.entries(byBasket)
      .map(([key, d]) => ({ key, ...d, gap: d.demand - d.supply, sat: d.demand > 0 ? Math.min(1, d.supply / d.demand) : 1 }))
      .sort((a, b) => b.gap - a.gap),
  [byBasket]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (baskets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <div className="text-lg">📦</div>
          <p className="text-sm font-semibold text-foreground">Tržní data nejsou k dispozici</p>
          <p className="text-xs text-muted-foreground">Klikněte na „Přepočítat ekonomiku" pro vygenerování dat o poptávce a nabídce.</p>
        </CardContent>
      </Card>
    );
  }

  const totalDemand = Object.values(byBasket).reduce((s, d) => s + d.demand, 0);
  const totalSupply = Object.values(byBasket).reduce((s, d) => s + d.supply, 0);
  const overallSatisfaction = totalDemand > 0 ? Math.min(1, totalSupply / totalDemand) : 1;

  return (
    <div className="space-y-4">
      {/* Overall */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold font-display">Celkové nasycení poptávky</span>
            <span className={`text-2xl font-bold font-mono ${overallSatisfaction >= 0.7 ? "text-primary" : overallSatisfaction >= 0.4 ? "text-amber-500" : "text-destructive"}`}>
              {(overallSatisfaction * 100).toFixed(0)}%
            </span>
          </div>
          <Progress value={overallSatisfaction * 100} className="h-3" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Auto-produkce: {Object.values(byBasket).reduce((s, d) => s + d.auto, 0).toFixed(1)}</span>
            <span>Bonus (recepty): {Object.values(byBasket).reduce((s, d) => s + d.bonus, 0).toFixed(1)}</span>
            <span>Export přebytek: {Object.values(byBasket).reduce((s, d) => s + d.surplus, 0).toFixed(1)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Pyramid — NEED / UPGRADE / PRESTIGE */}
      <div className="space-y-3">
        {["need", "upgrade", "prestige"].map(layerKey => {
          const layer = layers[layerKey];
          const meta = LAYER_META[layerKey];
          if (!layer) return (
            <Card key={layerKey} className="opacity-50">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-lg">{meta.icon}</span>
                <div>
                  <div className="text-sm font-semibold">{meta.label}</div>
                  <div className="text-[10px] text-muted-foreground">Žádná poptávka v této vrstvě</div>
                </div>
              </CardContent>
            </Card>
          );

          const sat = layer.demand > 0 ? Math.min(1, layer.supply / layer.demand) : 1;
          return (
            <Card key={layerKey}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <div>
                      <div className="text-sm font-semibold">{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground">{meta.desc}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold font-mono ${sat >= 0.7 ? "text-primary" : sat >= 0.4 ? "text-amber-500" : "text-destructive"}`}>
                      {(sat * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">{meta.keys.length} košů</div>
                  </div>
                </div>
                <Progress value={sat * 100} className="h-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Zásobení: {layer.supply.toFixed(0)}</span>
                  <span>Potřeba: {layer.demand.toFixed(0)}</span>
                  <span className={layer.demand > layer.supply ? "text-destructive font-semibold" : "text-primary"}>
                    Deficit: {Math.max(0, layer.demand - layer.supply).toFixed(0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-basket breakdown */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📦 Poptávka dle koše ({sortedBaskets.length})
            <InfoTip>Seřazeno dle deficitu. Auto = automatická produkce z populace, Bonus = z receptů.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-2 max-h-80 overflow-y-auto">
          {sortedBaskets.map(g => {
            const satPct = g.sat * 100;
            const meta = basketMeta.get(g.key);
            const layerKey = getLayerForBasket(g.key);
            const ftColor = layerKey === "need" ? "text-destructive" : layerKey === "upgrade" ? "text-amber-500" : "text-blue-500";
            return (
              <div key={g.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    {meta?.icon} {meta?.label || g.key}
                    <Badge variant="outline" className={`text-[8px] ${ftColor}`}>
                      {layerKey.toUpperCase()}
                    </Badge>
                  </span>
                  <span className="font-mono text-[10px]">
                    {g.supply.toFixed(0)}/{g.demand.toFixed(0)}
                    <span className={`ml-1 font-semibold ${satPct >= 70 ? "text-primary" : satPct >= 40 ? "text-amber-500" : "text-destructive"}`}>
                      ({satPct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <Progress value={Math.min(100, satPct)} className="h-1" />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Auto: {g.auto.toFixed(1)} | Bonus: {g.bonus.toFixed(1)}</span>
                  <span>Přebytek: {g.surplus.toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Goods catalog */}
      <Collapsible open={showCatalog} onOpenChange={setShowCatalog}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card/50 hover:bg-muted/30 transition-colors text-sm font-semibold">
            <span>📋 Katalog zboží a receptů</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showCatalog ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <GoodsDemandSubTab sessionId={sessionId} playerName={playerName} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default DemandFulfillmentPanel;
