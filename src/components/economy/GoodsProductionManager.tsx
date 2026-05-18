/**
 * Goods Production Manager — Fáze 1A (Správa goods)
 *
 * Player-facing command center over Goods v4.3. Strict boundaries:
 *  - Read-only over city_market_baskets, building_templates, province_nodes,
 *    player_trade_system_access, basket_trade_flows (G1: optional), node_inventory.
 *  - Only mutating action is navigation to CityBuildingsPanel (build a building).
 *  - NO writes to city_market_baskets. NO node_production_orders yet (Fáze 1B).
 *  - All city_market_baskets queries are filtered to latest turn (G2).
 *  - Satisfaction is demand-weighted, mirror of supabase/functions/_shared/basket-context.ts (G3).
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  CANONICAL_BASKET_KEYS,
  resolveBasketKey,
  weightedSatisfaction,
  VALID_BASKETS,
} from "@/lib/goodsCatalog";
import CrisisHeader from "./goods-production/CrisisHeader";
import BasketMatrix from "./goods-production/BasketMatrix";
import BasketDetailDrawer from "./goods-production/BasketDetailDrawer";
import OrdersCapacityPanel from "./goods-production/OrdersCapacityPanel";
import { useDevMode } from "@/hooks/useDevMode";
import type { BasketAgg, CityBasketRow } from "./goods-production/types";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  onTabChange?: (tab: string) => void;
}

const GoodsProductionManager = ({
  sessionId,
  currentPlayerName,
  currentTurn,
  cities,
  onTabChange,
}: Props) => {
  const { devMode } = useDevMode();
  const [rawRows, setRawRows] = useState<CityBasketRow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [access, setAccess] = useState<Array<{ trade_system_id: string; access_level: string }>>([]);
  const [tradeFlows, setTradeFlows] = useState<any[]>([]);
  const [snapshotTurn, setSnapshotTurn] = useState<number | null>(null);
  const [importAvailable, setImportAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickedBasket, setPickedBasket] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const myCities = useMemo(
    () => cities.filter(c => c.owner_player === currentPlayerName),
    [cities, currentPlayerName],
  );
  const myCityIds = useMemo(() => new Set(myCities.map(c => c.id)), [myCities]);

  const fetchAll = async () => {
    setLoading(true);
    // G2: try currentTurn first, fall back to max turn per session+player.
    const baseSel = supabase
      .from("city_market_baskets")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", currentPlayerName);

    const [curRes, tplRes, accRes, btfRes] = await Promise.all([
      baseSel.eq("turn_number", currentTurn).limit(1000),
      supabase
        .from("building_templates")
        .select("id,name,category,required_settlement_level,effects,cost_wealth,cost_wood,cost_stone,cost_iron"),
      supabase
        .from("player_trade_system_access")
        .select("trade_system_id,access_level,tariff_factor")
        .eq("session_id", sessionId)
        .eq("player_name", currentPlayerName),
      // G1: basket_trade_flows is optional — never block
      supabase
        .from("basket_trade_flows" as any)
        .select("basket_key,volume,target_player,trade_system_id")
        .eq("session_id", sessionId)
        .limit(2000)
        .then(r => r, () => ({ data: [], error: { code: "missing" } } as any)),
    ]);

    let rows = (curRes.data || []) as CityBasketRow[];
    let usedTurn = currentTurn;
    if (rows.length === 0) {
      const { data: anyRows } = await supabase
        .from("city_market_baskets")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", currentPlayerName)
        .order("turn_number", { ascending: false })
        .limit(1000);
      const max = (anyRows || []).reduce((m: number, r: any) => Math.max(m, r.turn_number), 0);
      rows = ((anyRows || []) as CityBasketRow[]).filter(r => r.turn_number === max);
      usedTurn = max || currentTurn;
    }
    setRawRows(rows);
    setSnapshotTurn(usedTurn);
    setTemplates(tplRes.data || []);
    setAccess((accRes.data || []) as any);
    const btfData = (btfRes as any)?.data || [];
    setTradeFlows(btfData);
    setImportAvailable(!(btfRes as any)?.error || (btfData?.length ?? 0) > 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentPlayerName, currentTurn]);

  // Aggregate per canonical basket (resolve legacy keys, scope = my cities only)
  const aggByBasket: BasketAgg[] = useMemo(() => {
    const map = new Map<string, {
      demand: number; supply: number; auto: number; recipe: number; building: number;
      importVol: number; unmet: number; cities: Set<string>;
      rows: Array<{ local_demand: number; domestic_satisfaction: number }>;
    }>();
    for (const r of rawRows) {
      if (!myCityIds.has(r.city_id)) continue;
      const key = resolveBasketKey(r.basket_key);
      if (!(VALID_BASKETS as readonly string[]).includes(key)) continue;
      if (!map.has(key)) {
        map.set(key, {
          demand: 0, supply: 0, auto: 0, recipe: 0, building: 0,
          importVol: 0, unmet: 0, cities: new Set(), rows: [],
        });
      }
      const a = map.get(key)!;
      a.demand += Number(r.local_demand) || 0;
      a.supply += Number(r.local_supply) || 0;
      a.auto   += Number(r.auto_supply)  || 0;
      a.recipe += Number(r.recipe_bonus) || 0;
      a.building += Number(r.building_bonus) || 0;
      a.unmet  += Number(r.unmet_demand) || Math.max(0, (Number(r.local_demand) || 0) - (Number(r.local_supply) || 0));
      a.cities.add(r.city_id);
      a.rows.push({ local_demand: Number(r.local_demand) || 0, domestic_satisfaction: Number(r.domestic_satisfaction) || 0 });
    }
    // Fold import volumes (basket_trade_flows where target_player = me)
    for (const f of tradeFlows) {
      if (f.target_player !== currentPlayerName) continue;
      const key = resolveBasketKey(f.basket_key);
      const a = map.get(key);
      if (a) a.importVol += Number(f.volume) || 0;
    }
    // Build final ordered list including missing baskets as zero rows.
    const out: BasketAgg[] = [];
    for (const k of CANONICAL_BASKET_KEYS) {
      const a = map.get(k);
      if (!a) {
        out.push({
          key: k, demand: 0, supply: 0, auto: 0, recipe: 0, building: 0,
          importVol: 0, unmet: 0, sat: 1, cityCount: 0,
        });
        continue;
      }
      const sat = weightedSatisfaction(a.rows);
      out.push({
        key: k,
        demand: a.demand,
        supply: a.supply,
        auto: a.auto,
        recipe: a.recipe,
        building: a.building,
        importVol: a.importVol,
        unmet: a.unmet,
        sat,
        cityCount: a.cities.size,
      });
    }
    // Sort worst-first; baskets with no demand pushed to the end.
    out.sort((a, b) => {
      const aHas = a.demand > 0 ? 0 : 1;
      const bHas = b.demand > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.sat - b.sat;
    });
    return out;
  }, [rawRows, tradeFlows, myCityIds, currentPlayerName]);

  // Per-basket "is there any reachable surplus" for diagnosis
  const reachableSurplusByBasket = useMemo(() => {
    const set = new Set<string>();
    const accessibleSystems = new Set(
      access.filter(a => a.access_level && a.access_level !== "none").map(a => a.trade_system_id),
    );
    for (const f of tradeFlows) {
      if (accessibleSystems.has(f.trade_system_id)) {
        set.add(resolveBasketKey(f.basket_key));
      }
    }
    return set;
  }, [access, tradeFlows]);

  const handlePick = (key: string) => {
    setPickedBasket(key);
    setDrawerOpen(true);
  };

  const handleNavigateToCities = (cityId: string, templateId: string, basketKey: string) => {
    try {
      sessionStorage.setItem("goods.buildHint", JSON.stringify({
        cityId, templateId, basketKey, ts: Date.now(),
      }));
    } catch {}
    const city = myCities.find(c => c.id === cityId);
    toast.info(`Otevři ${city?.name || "město"} → Budovy a postav doporučený template.`);
    onTabChange?.("realm");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Ekonomika přepočítána");
        await fetchAll();
      } else {
        toast.warning("Přepočet selhal");
      }
    } catch (e: any) {
      toast.error(`Chyba: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (rawRows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <div className="text-lg">📦</div>
          <p className="text-sm font-semibold">Tržní data nejsou k dispozici</p>
          <p className="text-xs text-muted-foreground">
            Klikni na "Přepočítat ekonomiku" pro vygenerování dat.
          </p>
          <Button size="sm" onClick={handleRefresh} disabled={refreshing} className="mt-2">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Přepočítat
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Snapshot badge (G2) */}
      {snapshotTurn !== null && snapshotTurn !== currentTurn && (
        <div className="flex justify-end">
          <Badge variant="outline" className="text-[10px]">
            ⚠ snapshot z turnu {snapshotTurn} (aktuální {currentTurn})
          </Badge>
        </div>
      )}

      <CrisisHeader baskets={aggByBasket} onPick={handlePick} />

      <BasketMatrix rows={aggByBasket} importAvailable={importAvailable} onPick={handlePick} />

      {/* Production Plan placeholder */}
      <Card className="border-dashed border-border/40">
        <CardContent className="p-4 space-y-2">
          <div className="text-xs font-display font-semibold text-muted-foreground">
            🗺️ Plán výroby — Fáze 1B
          </div>
          <p className="text-[11px] text-muted-foreground">
            Plánování výroby per node (production orders) bude dostupné v další fázi.
            Vyžaduje zavedení omezeného produkčního budgetu nodu, jinak by orders neměly
            efekt na výstup ekonomiky.
          </p>
          <div className="pt-1">
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Počítám…" : "Přepočítat ekonomiku"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {devMode && (
        <OrdersCapacityPanel sessionId={sessionId} currentPlayerName={currentPlayerName} />
      )}



      <BasketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        basketKey={pickedBasket}
        sessionId={sessionId}
        cityRows={rawRows.filter(r => myCityIds.has(r.city_id))}
        cities={myCities}
        templates={templates}
        accessLevels={access}
        reachableSurplusByBasket={reachableSurplusByBasket}
        onNavigateToCities={handleNavigateToCities}
      />
    </div>
  );
};

export default GoodsProductionManager;
