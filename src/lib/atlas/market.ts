import { snapshotAge } from "./provenance";

export type MarketRow = { city_node_id: string; good_key: string; supply_volume: number | null; demand_volume: number | null; price_numeric: number | null; turn_number: number };
export type WorldGood = { good: string; markets: number; pricedMarkets: number; supply: number; demand: number; weightedPrice: number | null; balance: number };
export type WorldMarket = {
  status: "ok" | "empty" | "incomplete" | "error";
  snapshotTurn: number | null; age: number | null; stale: boolean; ageLabel: string; marketCount: number; goods: WorldGood[]; error: string | null;
};

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Transparent world view of ONE snapshot turn: price = Σ(price×demand)/Σdemand over markets with a price.
 * Incomplete or failed reads never produce totals.
 */
export function aggregateWorldMarket(rows: MarketRow[], o: { complete: boolean; error: string | null; snapshotTurn: number | null; currentTurn: number }): WorldMarket {
  const age = snapshotAge(o.snapshotTurn, o.currentTurn);
  const base = { snapshotTurn: o.snapshotTurn, age: age.age, stale: age.stale, ageLabel: age.label, error: o.error };
  if (o.error && !o.complete) return { ...base, status: "error", marketCount: 0, goods: [] };
  if (!o.complete) return { ...base, status: "incomplete", marketCount: 0, goods: [] };
  const own = rows.filter(r => r.turn_number === o.snapshotTurn);
  if (!own.length) return { ...base, status: "empty", marketCount: 0, goods: [] };
  const by = new Map<string, MarketRow[]>();
  for (const r of own) by.set(r.good_key, [...(by.get(r.good_key) || []), r]);
  const goods = [...by.entries()].map(([good, list]) => {
    const supply = list.reduce((s, r) => s + (num(r.supply_volume) ?? 0), 0);
    const demand = list.reduce((s, r) => s + (num(r.demand_volume) ?? 0), 0);
    const priced = list.filter(r => num(r.price_numeric) != null);
    const w = priced.reduce((s, r) => s + (num(r.demand_volume) ?? 0), 0);
    const weightedPrice = w > 0 ? priced.reduce((s, r) => s + r.price_numeric! * (num(r.demand_volume) ?? 0), 0) / w : null;
    return { good, markets: new Set(list.map(r => r.city_node_id)).size, pricedMarkets: priced.length, supply, demand, weightedPrice, balance: supply - demand };
  }).sort((a, b) => a.good.localeCompare(b.good));
  return { ...base, status: "ok", marketCount: new Set(own.map(r => r.city_node_id)).size, goods };
}
