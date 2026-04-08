import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Loader2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import GoodsDemandSubTab from "./GoodsDemandSubTab";

interface Props {
  sessionId: string;
  playerName: string;
  cities: any[];
}

interface DemandBasket {
  id: string;
  basket_key: string;
  city_id: string;
  fulfillment_type: string;
  tier: number;
  quantity_needed: number;
  quantity_fulfilled: number;
  satisfaction_score: number;
}

const LAYER_META: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  need: { label: "NEED — Přežití", icon: "🔴", color: "bg-destructive", desc: "Základní potřeby (jídlo, materiály). Nesaturace → destabilizace a hladomor." },
  upgrade: { label: "UPGRADE — Růst", icon: "🟡", color: "bg-amber-500", desc: "Civilizační růst (řemesla, zboží). Nesaturace → stagnace rozvoje." },
  prestige: { label: "PRESTIGE — Luxus", icon: "🔵", color: "bg-blue-500", desc: "Kulturní síla (luxus, rituální předměty). Nesaturace → ztráta prestiže." },
};

const DemandFulfillmentPanel = ({ sessionId, playerName, cities }: Props) => {
  const [baskets, setBaskets] = useState<DemandBasket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  const myCityIds = useMemo(() => {
    const ids = new Set<string>();
    cities.filter(c => c.owner_player === playerName).forEach(c => ids.add(c.id));
    return ids;
  }, [cities, playerName]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      // demand_baskets references province_nodes via city_id, need to find node ids for my cities
      const { data: nodes } = await supabase
        .from("province_nodes")
        .select("id, city_id")
        .eq("session_id", sessionId)
        .not("city_id", "is", null);

      const myNodeIds = (nodes || [])
        .filter((n: any) => myCityIds.has(n.city_id))
        .map((n: any) => n.id);

      if (myNodeIds.length === 0) {
        setBaskets([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("demand_baskets")
        .select("*")
        .eq("session_id", sessionId)
        .in("city_id", myNodeIds)
        .limit(500);

      setBaskets((data || []) as DemandBasket[]);
      setLoading(false);
    };
    fetch();
  }, [sessionId, myCityIds]);

  // Aggregate by fulfillment_type layer
  const layers = useMemo(() => {
    const map: Record<string, { needed: number; fulfilled: number; count: number; items: DemandBasket[] }> = {};
    for (const b of baskets) {
      const ft = (b.fulfillment_type || "need").toLowerCase();
      if (!map[ft]) map[ft] = { needed: 0, fulfilled: 0, count: 0, items: [] };
      map[ft].needed += b.quantity_needed;
      map[ft].fulfilled += b.quantity_fulfilled;
      map[ft].count++;
      map[ft].items.push(b);
    }
    return map;
  }, [baskets]);

  // Aggregate by basket_key across all cities
  const byGood = useMemo(() => {
    const map: Record<string, { needed: number; fulfilled: number; satisfaction: number; count: number; fulfillmentType: string; tier: number }> = {};
    for (const b of baskets) {
      if (!map[b.basket_key]) map[b.basket_key] = { needed: 0, fulfilled: 0, satisfaction: 0, count: 0, fulfillmentType: b.fulfillment_type, tier: b.tier };
      map[b.basket_key].needed += b.quantity_needed;
      map[b.basket_key].fulfilled += b.quantity_fulfilled;
      map[b.basket_key].satisfaction += b.satisfaction_score;
      map[b.basket_key].count++;
    }
    // Average satisfaction
    for (const k of Object.keys(map)) {
      map[k].satisfaction = map[k].count > 0 ? map[k].satisfaction / map[k].count : 0;
    }
    return map;
  }, [baskets]);

  // Sort goods by gap (most unfulfilled first)
  const sortedGoods = useMemo(() =>
    Object.entries(byGood)
      .map(([key, d]) => ({ key, ...d, gap: d.needed - d.fulfilled }))
      .sort((a, b) => b.gap - a.gap),
  [byGood]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (baskets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Žádná data o poptávce — spusťte výpočet obchodních toků (compute-trade-flows).
        </CardContent>
      </Card>
    );
  }

  const overallSatisfaction = baskets.length > 0
    ? baskets.reduce((s, b) => s + b.satisfaction_score, 0) / baskets.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Overall satisfaction */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold font-display">Celkové nasycení poptávky</span>
            <span className={`text-2xl font-bold font-mono ${overallSatisfaction >= 0.7 ? "text-primary" : overallSatisfaction >= 0.4 ? "text-amber-500" : "text-destructive"}`}>
              {(overallSatisfaction * 100).toFixed(0)}%
            </span>
          </div>
          <Progress value={overallSatisfaction * 100} className="h-3" />
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

          const sat = layer.needed > 0 ? layer.fulfilled / layer.needed : 0;
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
                    <div className="text-[10px] text-muted-foreground">{layer.count} košů</div>
                  </div>
                </div>
                <Progress value={sat * 100} className="h-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Splněno: {layer.fulfilled.toFixed(0)}</span>
                  <span>Potřeba: {layer.needed.toFixed(0)}</span>
                  <span className={layer.needed > layer.fulfilled ? "text-destructive font-semibold" : "text-primary"}>
                    Deficit: {Math.max(0, layer.needed - layer.fulfilled).toFixed(0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-good breakdown */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📦 Poptávka dle zboží ({sortedGoods.length})
            <InfoTip>Seřazeno dle deficitu — nejvíc chybějící zboží nahoře.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-2 max-h-80 overflow-y-auto">
          {sortedGoods.map(g => {
            const satPct = g.needed > 0 ? (g.fulfilled / g.needed) * 100 : 100;
            const ftColor = g.fulfillmentType === "need" ? "text-destructive" : g.fulfillmentType === "upgrade" ? "text-amber-500" : "text-blue-500";
            return (
              <div key={g.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    {g.key}
                    <Badge variant="outline" className={`text-[8px] ${ftColor}`}>
                      {g.fulfillmentType?.toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground text-[9px]">T{g.tier}</span>
                  </span>
                  <span className="font-mono text-[10px]">
                    {g.fulfilled.toFixed(0)}/{g.needed.toFixed(0)}
                    <span className={`ml-1 font-semibold ${satPct >= 70 ? "text-primary" : satPct >= 40 ? "text-amber-500" : "text-destructive"}`}>
                      ({satPct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <Progress value={Math.min(100, satPct)} className="h-1" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Goods catalog (collapsible) */}
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
