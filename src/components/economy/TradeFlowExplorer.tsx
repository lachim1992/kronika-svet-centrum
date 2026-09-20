// Read-only explorer over the canonical economic flows: what travels where,
// which settlements export or import, and where wealth accumulates.
// Pure reads of current-turn snapshots — no solver, no writes.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getBasketMeta } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  currentTurn: number;
  cities: Array<{ id: string; name: string; owner_player?: string | null }>;
  playerName?: string;
}

type BasketFlow = {
  id: string; basket_key: string; source_city_id: string | null; target_city_id: string | null;
  source_player: string | null; target_player: string | null; volume: number | null; gross_value: number | null;
  fiscal_capture: number | null; transport_modes: string[] | null;
};
type GoodFlow = {
  id: string; good_key: string; source_city_id: string | null; target_city_id: string | null;
  volume_per_turn: number | null; effective_price: number | null; status: string | null; transport_modes: string[] | null;
};
type Basket = {
  city_id: string; basket_key: string; local_demand: number | null; local_supply: number | null;
  unmet_demand: number | null; export_surplus: number | null; monetization: number | null; domestic_satisfaction: number | null;
};

const fmt = (value: number) => Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
const MODE_LABEL: Record<string, string> = { road: "po cestě", river: "po řece", sea: "po moři", land: "po zemi" };

const TradeFlowExplorer = ({ sessionId, currentTurn, cities, playerName }: Props) => {
  const [baskets, setBaskets] = useState<BasketFlow[]>([]);
  const [goods, setGoods] = useState<GoodFlow[]>([]);
  const [markets, setMarkets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const [basketRes, goodRes, marketRes] = await Promise.all([
        supabase.from("basket_trade_flows")
          .select("id, basket_key, source_city_id, target_city_id, source_player, target_player, volume, gross_value, fiscal_capture, transport_modes")
          .eq("session_id", sessionId).eq("turn_number", currentTurn),
        supabase.from("trade_flows")
          .select("id, good_key, source_city_id, target_city_id, volume_per_turn, effective_price, status, transport_modes")
          .eq("session_id", sessionId).eq("turn_created", currentTurn),
        supabase.from("city_market_baskets")
          .select("city_id, basket_key, local_demand, local_supply, unmet_demand, export_surplus, monetization, domestic_satisfaction")
          .eq("session_id", sessionId).eq("turn_number", currentTurn),
      ]);
      if (cancelled) return;
      const failure = basketRes.error || goodRes.error || marketRes.error;
      if (failure) { setError(failure.message); setLoading(false); return; }
      setBaskets((basketRes.data || []) as BasketFlow[]);
      setGoods((goodRes.data || []) as GoodFlow[]);
      setMarkets((marketRes.data || []) as Basket[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId, currentTurn]);

  const cityName = (id: string | null) => cities.find(city => city.id === id)?.name || "mimo říši";

  const byCommodity = useMemo(() => {
    const map = new Map<string, { key: string; kind: "basket" | "good"; volume: number; value: number; routes: number }>();
    baskets.forEach(flow => {
      const entry = map.get(`b:${flow.basket_key}`) || { key: flow.basket_key, kind: "basket" as const, volume: 0, value: 0, routes: 0 };
      entry.volume += Number(flow.volume || 0); entry.value += Number(flow.gross_value || 0); entry.routes += 1;
      map.set(`b:${flow.basket_key}`, entry);
    });
    goods.forEach(flow => {
      const entry = map.get(`g:${flow.good_key}`) || { key: flow.good_key, kind: "good" as const, volume: 0, value: 0, routes: 0 };
      const volume = Number(flow.volume_per_turn || 0);
      entry.volume += volume; entry.value += volume * Number(flow.effective_price || 0); entry.routes += 1;
      map.set(`g:${flow.good_key}`, entry);
    });
    return [...map.values()].sort((a, b) => b.value - a.value || b.volume - a.volume);
  }, [baskets, goods]);

  const byCity = useMemo(() => {
    const map = new Map<string, { id: string; exportValue: number; importValue: number; exportVolume: number; importVolume: number; partners: Set<string> }>();
    const entry = (id: string | null) => {
      if (!id) return null;
      if (!map.has(id)) map.set(id, { id, exportValue: 0, importValue: 0, exportVolume: 0, importVolume: 0, partners: new Set() });
      return map.get(id)!;
    };
    const add = (source: string | null, target: string | null, volume: number, value: number) => {
      const from = entry(source); const to = entry(target);
      if (from) { from.exportValue += value; from.exportVolume += volume; if (target) from.partners.add(target); }
      if (to) { to.importValue += value; to.importVolume += volume; if (source) to.partners.add(source); }
    };
    baskets.forEach(flow => add(flow.source_city_id, flow.target_city_id, Number(flow.volume || 0), Number(flow.gross_value || 0)));
    goods.forEach(flow => {
      const volume = Number(flow.volume_per_turn || 0);
      add(flow.source_city_id, flow.target_city_id, volume, volume * Number(flow.effective_price || 0));
    });
    return [...map.values()].sort((a, b) => (b.exportValue + b.importValue) - (a.exportValue + a.importValue));
  }, [baskets, goods]);

  const wealth = useMemo(() => {
    const map = new Map<string, { id: string; monetized: number; demand: number; supply: number; unmet: number; surplus: number }>();
    markets.forEach(row => {
      const entry = map.get(row.city_id) || { id: row.city_id, monetized: 0, demand: 0, supply: 0, unmet: 0, surplus: 0 };
      entry.monetized += Number(row.monetization || 0);
      entry.demand += Number(row.local_demand || 0);
      entry.supply += Number(row.local_supply || 0);
      entry.unmet += Number(row.unmet_demand || 0);
      entry.surplus += Number(row.export_surplus || 0);
      map.set(row.city_id, entry);
    });
    const list = [...map.values()].sort((a, b) => b.monetized - a.monetized);
    const total = list.reduce((sum, item) => sum + item.monetized, 0);
    return { list, total };
  }, [markets]);

  const modes = useMemo(() => {
    const counts = new Map<string, number>();
    [...baskets, ...goods].forEach(flow => (flow.transport_modes || []).forEach(mode => counts.set(mode, (counts.get(mode) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [baskets, goods]);

  if (loading) return <p className="text-sm text-muted-foreground">Načítám ekonomické toky…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!baskets.length && !goods.length && !markets.length) {
    return <p className="text-sm text-muted-foreground">Za tah {currentTurn} zatím nejsou spočítané žádné toky. Přepočítej ekonomiku nebo uzavři kolo.</p>;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-bold text-sm">Toky, materiály a bohatství</h3>
        <Badge variant="secondary">tah {currentTurn}</Badge>
        <Badge variant="secondary">{baskets.length + goods.length} zásilek</Badge>
        {modes.map(([mode, count]) => <Badge key={mode} variant="outline">{MODE_LABEL[mode] || mode} ×{count}</Badge>)}
      </div>

      <Tabs defaultValue="commodity">
        <TabsList className="h-9 bg-muted/20 rounded-xl p-1 gap-1">
          <TabsTrigger value="commodity" className="text-[11px] font-display">Co putuje</TabsTrigger>
          <TabsTrigger value="cities" className="text-[11px] font-display">Kam a odkud</TabsTrigger>
          <TabsTrigger value="wealth" className="text-[11px] font-display">Kde se hromadí bohatství</TabsTrigger>
        </TabsList>

        <TabsContent value="commodity" className="mt-3 space-y-2">
          {byCommodity.map(item => (
            <div key={`${item.kind}:${item.key}`} className="rounded-lg border border-border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {item.kind === "basket" ? `${getBasketMeta(item.key).icon} ${getBasketMeta(item.key).label}` : `📦 ${item.key}`}
                </span>
                <span className="text-xs text-muted-foreground">{fmt(item.value)} 💰</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {item.kind === "basket" ? "hotová dodávka na trh" : "surovina nebo polotovar do výroby"} · {fmt(item.volume)} jednotek · {item.routes} tras
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="cities" className="mt-3 space-y-2">
          {byCity.map(item => (
            <div key={item.id} className="rounded-lg border border-border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{cityName(item.id)}</span>
                <span className="text-xs text-muted-foreground">{item.partners.size} partnerů</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Vyváží {fmt(item.exportVolume)} jednotek za {fmt(item.exportValue)} · dováží {fmt(item.importVolume)} jednotek za {fmt(item.importValue)}
              </p>
            </div>
          ))}
          {byCity.length === 0 && <p className="text-xs text-muted-foreground">Mezi sídly zatím nic neputuje.</p>}
        </TabsContent>

        <TabsContent value="wealth" className="mt-3 space-y-2">
          {wealth.list.map(item => {
            const share = wealth.total > 0 ? (item.monetized / wealth.total) * 100 : 0;
            return (
              <div key={item.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{cityName(item.id)}</span>
                  <span className="text-xs text-muted-foreground">{fmt(share)} % zpeněženého obchodu</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Zpeněženo {fmt(item.monetized)} · poptávka {fmt(item.demand)} · dodávka {fmt(item.supply)} · nepokryto {fmt(item.unmet)} · přebytek na vývoz {fmt(item.surplus)}
                </p>
              </div>
            );
          })}
          {wealth.list.length === 0 && <p className="text-xs text-muted-foreground">Žádná tržní data pro tento tah.</p>}
        </TabsContent>
      </Tabs>

      {playerName && <p className="text-[11px] text-muted-foreground">Čísla jsou z posledního přepočtu ekonomiky, žádný odhad se nedopočítává.</p>}
    </section>
  );
};

export default TradeFlowExplorer;
