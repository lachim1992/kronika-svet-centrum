import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { needStabilityDrift, COMFORT_STABILITY_FLOOR, BASKET_DEMAND } from '../../supabase/functions/_shared/demandModel';
import { subsistenceRows } from '../../supabase/functions/_shared/subsistence';
import { starterBundle, starterEffects, starterReserveFor } from '../../supabase/functions/_shared/starterEconomy';
import { LABOR_FIELDS, LABOR_UNMAPPED_OK, producerLimit } from '@/lib/economyFieldContract';

// ACCEPTANCE: playable 100-soul starter town, player and AI, across habitable biomes.
const STORABLE = new Set(['raw_grain', 'peat', 'charcoal', 'lumber', 'raw_timber', 'flour', 'baked_staples', 'preserved_food']);
const goodOf = (key: string): Good => {
  const c = GOODS.find(g => g.key === key)!;
  return { key, basket: c.basket, price: 1, stage: c.stage as any, storable: STORABLE.has(key), bulk: 1, density: 30,
    perishability: STORABLE.has(key) ? 0 : 1, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
    transshipment: 0, finalUse: c.finalUse, household: (c as any).household } as any;
};
const town = (id: string, x: number, owner: string, stability = 0.65): City => ({ id, owner, name: id, cell: `${x},0`, population: 100,
  classes: { peasants: 100 }, soldiers: 0, stability, irrigation: 0, labor: {}, market: 1, storage: 10, admin: 0, security: 1, guild: 0,
  ideology: 'customary_local', coastal: false });
const fromRecipe = (id: string, city: string, key: string, capacity: number, jobs: number): Producer => {
  const r = RECIPES.find(x => x.key === key)!;
  return { id, city, channel: 'facility', capacity, jobs, recipe: { key, good: r.output, qty: r.qty, inputs: r.inputs as any,
    labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1,
    source: r.inputs.length === 0, distinctive: false };
};
/** Starter bundle → producers through the same contract the bootstrap writes. */
const starterTown = (id: string, x: number, owner: string, coastal: boolean, fuelLand: boolean, nodes = 0): Producer[] => [
  ...starterBundle(coastal, fuelLand).flatMap(c => {
    const e: any = starterEffects(c, 100);
    return (e.recipe_keys || []).map((k: string) => fromRecipe(`${id}:${k}`, id, k, Object.values(e.basket_outputs)[0] as number, e.jobs_capacity));
  }),
  ...Array.from({ length: nodes }, (_, i) => fromRecipe(`${id}:node${i}`, id, 'fell_timber', 7, 100)),
];
const KEYS = ['raw_grain', 'raw_fish', 'well_water', 'peat', 'raw_timber', 'basic_clothing'].filter(k => GOODS.some(g => g.key === k));
const conserve = (r: ReturnType<typeof resolveGoodsEconomy>) => {
  for (const b of r.balances) expect(b.opening + produced(b) + b.imported)
    .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 6);
};
const coverage = (r: ReturnType<typeof resolveGoodsEconomy>, city: string, basket: string) => {
  const bs = r.balances.filter(b => b.city === city && goodOf(b.good).basket === basket);
  const d = bs.reduce((s, b) => s + b.demand, 0), u = bs.reduce((s, b) => s + b.unmet_demand, 0);
  return d > 0 ? 1 - u / d : 1;
};
const run = (snap: Snapshot, turns: number) => {
  let s = snap, last!: ReturnType<typeof resolveGoodsEconomy>; const history: ReturnType<typeof resolveGoodsEconomy>[] = [];
  for (let t = 0; t < turns; t++) {
    last = resolveGoodsEconomy(s); history.push(last);
    s = { ...s, turn: s.turn + 1, opening: last.balances.filter(b => b.stored > 0).map(b => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality })) };
  }
  return { last, history };
};

const BIOMES = [
  { name: 'coastal', coastal: true, fuel: true }, { name: 'inland river', coastal: false, fuel: true },
  { name: 'forest', coastal: false, fuel: true }, { name: 'wetland', coastal: true, fuel: true },
  { name: 'dry habitable (no peat)', coastal: false, fuel: false },
];

describe('starter acceptance: player + AI, habitable biomes', () => {
  for (const b of BIOMES) it(`${b.name}: 20 turns no action — food/water covered, labour ≤ workforce, conservation, no phantom goods`, () => {
    const snap: Snapshot = { turn: 1, goods: KEYS.map(goodOf), edges: [], fame: [],
      cities: [town('player', 0, 'P'), town('ai', 9, 'AI')],
      producers: [...starterTown('player', 0, 'P', b.coastal, b.fuel, 5), ...starterTown('ai', 9, 'AI', b.coastal, b.fuel)],
      opening: Object.entries(starterReserveFor(100, b.fuel)).flatMap(([good, qty]) => KEYS.includes(good) ? [{ city: 'player', good, qty, quality: 1 }, { city: 'ai', good, qty, quality: 1 }] : []) };
    const { history } = run(snap, 20);
    for (const r of history) {
      conserve(r);
      for (const c of ['player', 'ai']) {
        expect(coverage(r, c, 'staple_food')).toBeGreaterThanOrEqual(0.95);
        expect(coverage(r, c, 'drinking_water')).toBeGreaterThanOrEqual(0.95);
        const l = r.labor.find(x => x.city === c)!;
        expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce + 1e-6);
      }
      // No stockpile of non-storable water/fish ever carries over.
      for (const bal of r.balances) if (['well_water', 'raw_fish'].includes(bal.good)) expect(bal.stored).toBe(0);
    }
  });

  it('refresh idempotence: the same snapshot resolves to the identical ledger', () => {
    const snap: Snapshot = { turn: 3, goods: KEYS.map(goodOf), edges: [], fame: [], opening: [],
      cities: [town('player', 0, 'P')], producers: starterTown('player', 0, 'P', false, true, 5) };
    expect(JSON.stringify(resolveGoodsEconomy(snap))).toBe(JSON.stringify(resolveGoodsEconomy(snap)));
  });

  it('genuine crop failure (no food producer, no reserve) is a famine, not hidden', () => {
    const snap: Snapshot = { turn: 1, goods: KEYS.map(goodOf), edges: [], fame: [], opening: [],
      cities: [town('player', 0, 'P')], producers: starterTown('player', 0, 'P', false, true).filter(p => !p.recipe.key.startsWith('harvest')) };
    const r = resolveGoodsEconomy(snap);
    const [row] = subsistenceRows([{ id: 'player', population: 100 }], r.balances, snap.goods, r.labor);
    expect(row.food_status).toBe('famine');
  });
});

describe('slow fuel/clothing consequences', () => {
  const rows = (food: number, water: number, fuel: number, cloth: number, tools = 0) => [
    { basket_key: 'staple_food', satisfaction_score: food, quantity_needed: 1.05 },
    { basket_key: 'drinking_water', satisfaction_score: water, quantity_needed: 0.42 },
    { basket_key: 'fuel', satisfaction_score: fuel, quantity_needed: 0.63 },
    { basket_key: 'basic_clothing', satisfaction_score: cloth, quantity_needed: 0.42 },
    { basket_key: 'tools', satisfaction_score: tools, quantity_needed: 0.38 }];
  it('Lambadagrad case (food/water 100 %, fuel 51 %, clothing 0): −1/turn, then holds at the floor — no spiral', () => {
    let st = 43;
    for (let t = 0; t < 20; t++) st += needStabilityDrift(rows(1, 1, 0.51, 0), st).drift;
    expect(st).toBe(COMFORT_STABILITY_FLOOR);
  });
  it('tools never move stability; full comfort grows stability', () => {
    expect(needStabilityDrift(rows(1, 1, 1, 1, 0), 60).drift).toBe(2);
    expect(BASKET_DEMAND.tools.basicNeeds).toBe(false);
  });
  it('critical food collapse still bites hard', () => {
    expect(needStabilityDrift(rows(0.2, 0.2, 1, 1), 60).drift).toBe(-5);
  });
});

describe('rationing vs famine and UI contract', () => {
  const goods = [{ key: 'raw_grain', basket: 'staple_food' }];
  const st = (unmet: number) => subsistenceRows([{ id: 'c', population: 100 }], [{ city: 'c', good: 'raw_grain', demand: 1, unmet_demand: unmet }], goods)[0].food_status;
  it('10 % deficit = rationing, 20 % = famine, 2 % = minor', () => {
    expect(st(0.1)).toBe('rationing'); expect(st(0.2)).toBe('famine'); expect(st(0.02)).toBe('minor'); expect(st(0)).toBe('ok');
  });
  it('every labor key emitted by the engine is mapped or exempted', () => {
    const snap: Snapshot = { turn: 1, goods: KEYS.map(goodOf), edges: [], fame: [], opening: [],
      cities: [town('player', 0, 'P')], producers: starterTown('player', 0, 'P', false, true, 5) };
    const mapped = new Set(LABOR_FIELDS.map(f => f.key));
    for (const k of Object.keys(resolveGoodsEconomy(snap).labor[0])) expect(mapped.has(k) || LABOR_UNMAPPED_OK.has(k)).toBe(true);
  });
  it('producerLimit reads the diagnostic, prioritising route, input, then staffing', () => {
    expect(producerLimit({ blocked: 'missing_local_delivery_route' })).toBe('chybí cesta do města');
    expect(producerLimit({ bottleneck: 'lumber', factors: { staffing: 0.1 } })).toBe('chybí vstup: lumber');
    expect(producerLimit({ factors: { staffing: 0.07 } })).toBe('málo pracovníků (7 %)');
    expect(producerLimit({ factors: { staffing: 1, tools: 1, stability: 1, logistics: 1 } })).toBeNull();
  });
});

describe('construction chain: raw_timber → lumber → granary needs a real path', () => {
  const g = ['raw_timber', 'lumber', 'granary_storage'].filter(k => GOODS.some(x => x.key === k)).map(goodOf);
  it('connected: timber is sawn and the granary is built from real lumber; disconnected: none, no trade without route', () => {
    for (const connected of [true, false]) {
      const snap: Snapshot = { turn: 1, goods: g, fame: [], opening: [],
        cities: [town('a', 0, 'P', 1), town('b', 3, 'P', 1)],
        producers: [fromRecipe('b:fell', 'b', 'fell_timber', 6, 10), fromRecipe('a:saw', 'a', 'saw_timber', 2, 10), fromRecipe('a:gran', 'a', 'build_granary', 1, 10)],
        edges: connected ? [{ id: 'r', from: '0,0', to: '3,0', cost: 1, capacity: 100, mode: 'road', risk: 0, toll: 0, border: 0 }] : [] };
      const r = resolveGoodsEconomy(snap); conserve(r);
      const real = (id: string) => r.diagnostics.find(d => d.producer === id)?.realized || 0;
      if (connected) { expect(real('a:saw')).toBeGreaterThan(0); expect(real('a:gran')).toBeGreaterThan(0); }
      else { expect(real('a:saw')).toBe(0); expect(real('a:gran')).toBe(0); expect(r.flows.filter(f => f.source !== f.destination).length).toBe(0); }
    }
  });
});
