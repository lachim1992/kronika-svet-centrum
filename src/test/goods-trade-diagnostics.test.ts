import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot, type Edge } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket = 'staple_food', price = 2, storageLoss = 0): Good => ({
  key, basket, price, stage: 'final', storable: true, bulk: 1, density: 30, perishability: 0, storageLoss,
  storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: true,
});
const city = (id: string, x: number, pop: number, storage = 10): City => ({
  id, owner: 'p', name: id, cell: `${x},0`, population: pop,
  classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability: 1, irrigation: 0,
  labor: {}, market: 2, storage, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false,
});
const farm = (c: string, cap: number): Producer => ({
  id: `farm:${c}`, city: c, channel: 'facility', capacity: cap, jobs: 100,
  recipe: { key: `harvest:${c}`, good: 'raw_grain', qty: 2, inputs: [], labor: L, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false,
});
const road = (a: number, b: number, capacity = 100): Edge[] => ([
  { id: `r${a}${b}`, from: `${a},0`, to: `${b},0`, cost: 0.1, capacity, mode: 'road', risk: 0, toll: 0, border: 0 },
  { id: `r${b}${a}`, from: `${b},0`, to: `${a},0`, cost: 0.1, capacity, mode: 'road', risk: 0, toll: 0, border: 0 },
]);
const snap = (cities: City[], producers: Producer[], edges: Edge[], opening: Snapshot['opening'] = [], goods = [good('raw_grain')]): Snapshot =>
  ({ turn: 2, cities, goods, producers, edges, opening, fame: [] });
const bal = (r: ReturnType<typeof resolveGoodsEconomy>, c: string, g = 'raw_grain') =>
  r.balances.find(b => b.city === c && b.good === g)!;
const expectConservation = (r: ReturnType<typeof resolveGoodsEconomy>) => {
  for (const b of r.balances) expect(b.opening + produced(b) + b.imported)
    .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 7);
};

describe('surplus food trade — surplus feeds hungry neighbours before any discard', () => {
  // Source: need ~27 (pop 3000), farm 80 → large surplus. Two hungry towns: need ~18 each, no farms.
  const cities = [city('src', 0, 3000), city('town1', 1, 2000), city('town2', 2, 2000)];
  const edges = [...road(0, 1), ...road(1, 2)];
  it('connected route with capacity ships a meaningful share of the surplus', () => {
    const r = resolveGoodsEconomy(snap(cities, [farm('src', 80)], edges));
    const s = bal(r, 'src');
    expect(s.exported).toBeGreaterThan(5);
    for (const t of ['town1', 'town2']) {
      const b = bal(r, t);
      expect(b.imported).toBeGreaterThan(1);
      expect(b.unmet_demand).toBeLessThan(b.demand);
    }
    // Exported food is physically delivered (minus transport loss), never teleported.
    const delivered = r.flows.filter(f => f.source === 'src').reduce((a, f) => a + f.delivered, 0);
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThanOrEqual(s.exported);
    expectConservation(r);
  });
  it('no source is drained below its own demand reserve', () => {
    const r = resolveGoodsEconomy(snap(cities, [farm('src', 80)], edges));
    const s = bal(r, 'src');
    expect(s.consumed_household + s.consumed_state).toBeGreaterThan(0);
    expect(s.opening + produced(s) - s.exported).toBeGreaterThanOrEqual(s.consumed_household + s.consumed_state - 1e-6);
  });
  it('disconnected towns starve with a diagnosed reason, never phantom deliveries', () => {
    const r = resolveGoodsEconomy(snap(cities, [farm('src', 80)], []));
    const s = bal(r, 'src');
    expect(s.exported).toBe(0);
    expect(r.flows).toHaveLength(0);
    for (const t of ['town1', 'town2']) {
      const b = bal(r, t);
      expect(b.imported).toBe(0);
      expect(b.unmet_demand).toBeGreaterThan(0);
      const blocker = r.importBlockers.find(x => x.city === t && x.good === 'raw_grain');
      expect(blocker, `blocker for ${t}`).toBeDefined();
      expect(['route_unreachable', 'no_source_attempted']).toContain(blocker!.reason);
    }
    expectConservation(r);
  });
  it('a covered good records no import blocker', () => {
    const r = resolveGoodsEconomy(snap(cities, [farm('src', 80)], edges));
    expect(r.importBlockers.filter(x => x.good === 'raw_grain' && x.city === 'src')).toHaveLength(0);
  });
  it('repeated resolution is byte-identical (refresh idempotence)', () => {
    const s1 = snap(cities, [farm('src', 80)], edges);
    const a = resolveGoodsEconomy(s1);
    const b = resolveGoodsEconomy(s1);
    expect(JSON.stringify(a.flows)).toBe(JSON.stringify(b.flows));
    expect(JSON.stringify(a.importBlockers)).toBe(JSON.stringify(b.importBlockers));
    expect(JSON.stringify(a.balances)).toBe(JSON.stringify(b.balances));
  });
});

describe('loss decomposition — decay vs transport vs warehouse discard', () => {
  it('a city with zero warehouse discards its surplus as lost_discard, not generic spoilage', () => {
    const r = resolveGoodsEconomy(snap([city('iso', 0, 1000, 0)], [farm('iso', 50)], []));
    const b = bal(r, 'iso');
    expect(b.stored).toBe(0);
    expect(b.lost_discard).toBeGreaterThan(0);
    expect(b.lost_transport).toBe(0);
    expect(b.lost_spoilage).toBeCloseTo(b.lost_decay + b.lost_transport + b.lost_discard, 7);
    expectConservation(r);
  });
  it('opening stock decays at the storage-loss rate and is reported as lost_decay', () => {
    const g = good('raw_grain', 'staple_food', 2, 0.5);
    const r = resolveGoodsEconomy(snap([city('iso', 0, 1000, 10)], [], [],
      [{ city: 'iso', good: 'raw_grain', qty: 10, quality: 1 }], [g]));
    const b = bal(r, 'iso');
    expect(b.lost_decay).toBeCloseTo(10 * 0.5 / (1 + 10), 6); // qty × storageLoss / (1 + city storage)
    expect(b.lost_spoilage).toBeCloseTo(b.lost_decay + b.lost_transport + b.lost_discard, 7);
  });
  it('a warehoused city stores its surplus instead of discarding it', () => {
    const r = resolveGoodsEconomy(snap([city('iso', 0, 1000, 10)], [farm('iso', 50)], []));
    const b = bal(r, 'iso');
    expect(b.stored).toBeGreaterThan(0);
    expect(b.lost_discard).toBe(0);
    expectConservation(r);
  });
});
