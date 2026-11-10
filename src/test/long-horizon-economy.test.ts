import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { subsistenceRows } from '../../supabase/functions/_shared/subsistence';
import { starterBundle, starterEffects, starterReserveFor } from '../../supabase/functions/_shared/starterEconomy';
import { chooseSubsistenceBuild } from '../../supabase/functions/_shared/subsistenceBuild';

// LONG-HORIZON STRESS HARNESS: real goods solver, growing population, physical stocks, and the same
// deterministic primary-investment chooser the AI uses (paid from a treasury, staffed by real workers).
const STORABLE = new Set(['raw_grain', 'peat', 'charcoal', 'raw_timber']);
const KEYS = ['raw_grain', 'raw_fish', 'well_water', 'peat', 'raw_timber'].filter(k => GOODS.some(g => g.key === k));
const goodOf = (key: string): Good => {
  const c = GOODS.find(g => g.key === key)!;
  return { key, basket: c.basket, price: 1, stage: c.stage as any, storable: STORABLE.has(key), bulk: 1, density: 30,
    perishability: STORABLE.has(key) ? 0 : 1, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0,
    transshipment: 0, finalUse: c.finalUse, household: (c as any).household } as any;
};
const GOODS_ = KEYS.map(goodOf);
const prod = (id: string, city: string, key: string, capacity: number, jobs: number): Producer => {
  const r = RECIPES.find(x => x.key === key)!;
  return { id, city, channel: 'facility', capacity, jobs, recipe: { key, good: r.output, qty: r.qty, inputs: r.inputs as any,
    labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1,
    source: r.inputs.length === 0, distinctive: false };
};
// Same template contract as the DB rows (Farma 7 food, Studna 6 water, Rybářství 4, Rašeliniště 3).
const TEMPLATE: Record<string, { recipe: string; cap: number; jobs: number; cost: number }> = {
  Farma: { recipe: 'harvest_wheat', cap: 7, jobs: 100, cost: 10 }, Studna: { recipe: 'draw_water', cap: 6, jobs: 50, cost: 5 },
  'Rybářství': { recipe: 'catch_fish', cap: 4, jobs: 30, cost: 10 }, 'Rašeliniště': { recipe: 'cut_peat', cap: 3, jobs: 30, cost: 8 },
};
const NAMES = new Set(Object.keys(TEMPLATE).map(n => n.toLowerCase()));
const city = (id: string, owner: string, x: number, coastal: boolean, pop = 100): City => ({ id, owner, name: id, cell: `${x},0`, population: pop,
  classes: { peasants: pop }, soldiers: 0, stability: 0.65, irrigation: 0, labor: {}, market: 1, storage: 10, admin: 0, security: 1, guild: 0,
  ideology: 'customary_local', coastal });
const starter = (id: string, coastal: boolean): Producer[] => starterBundle(coastal, true).flatMap(c => {
  const e: any = starterEffects(c, 100);
  return (e.recipe_keys || []).map((k: string) => prod(`${id}:${k}`, id, k, Object.values(e.basket_outputs)[0] as number, e.jobs_capacity));
});
const cov = (r: any, c: string, basket: string) => {
  const bs = r.balances.filter((b: any) => b.city === c && goodOf(b.good).basket === basket);
  const d = bs.reduce((s: number, b: any) => s + b.demand, 0), u = bs.reduce((s: number, b: any) => s + b.unmet_demand, 0);
  return d > 0 ? 1 - u / d : 1;
};

type Policy = 'invest' | 'none';
interface Shock { turn: number; city: string; destroy: string } // basket whose producers are lost (crop failure, flood)
interface TurnKpi { turn: number; city: string; pop: number; food: number; water: number; fuel: number; deaths: number; idle: number; buildings: number }

function simulate(turns: number, policy: Policy, shocks: Shock[] = []) {
  const seeds = [{ id: 'player', owner: 'P', coastal: false }, { id: 'ai1', owner: 'AI1', coastal: true }, { id: 'ai2', owner: 'AI2', coastal: false }];
  let cities = seeds.map((s, i) => city(s.id, s.owner, i * 9, s.coastal));
  let producers = seeds.flatMap(s => starter(s.id, s.coastal));
  const treasury: Record<string, number> = { P: 20, AI1: 20, AI2: 20 };
  let opening = seeds.flatMap(s => Object.entries(starterReserveFor(100, true)).filter(([g]) => KEYS.includes(g)).map(([good, qty]) => ({ city: s.id, good, qty, quality: 1 })));
  const kpis: TurnKpi[] = []; let n = 0;
  for (let t = 1; t <= turns; t++) {
    for (const sh of shocks) if (sh.turn === t) producers = producers.filter(p => !(p.city === sh.city && goodOf(p.recipe.good).basket === sh.destroy));
    const snap: Snapshot = { turn: t, goods: GOODS_, edges: [], fame: [], cities, producers, opening };
    const r = resolveGoodsEconomy(snap);
    // Physical conservation + no phantom non-storables, every turn.
    for (const b of r.balances) expect(b.opening + produced(b) + b.imported)
      .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 6);
    for (const b of r.balances) if (b.good === 'well_water' || b.good === 'raw_fish') expect(b.stored).toBe(0);
    const rows = subsistenceRows(cities.map(c => ({ id: c.id, population: c.population })), r.balances as any, GOODS_ as any, r.labor);
    const next: City[] = [];
    for (const c of cities) {
      const l = r.labor.find(x => x.city === c.id)!;
      expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce + 1e-6);
      const food = cov(r, c.id, 'staple_food'), water = cov(r, c.id, 'drinking_water'), fuel = cov(r, c.id, 'fuel');
      const row = rows.find(x => x.city === c.id)!;
      // Population: growth only with secure food+water; genuine deficit (≥15 % = famine) kills.
      const famine = row.food_deficit_ratio >= 0.15 || water < 0.85;
      const deaths = famine ? Math.round(c.population * Math.max(row.food_deficit_ratio, 1 - water) * 0.2) : 0;
      const growth = food >= 0.98 && water >= 0.98 ? Math.round(c.population * 0.015) : 0;
      const pop = Math.max(10, c.population + growth - deaths);
      kpis.push({ turn: t, city: c.id, pop: c.population, food, water, fuel, deaths, idle: l.available_workforce - l.employed_total, buildings: producers.filter(p => p.city === c.id).length });
      next.push({ ...c, population: pop, classes: { peasants: pop } });
      treasury[c.owner] += c.population * 0.05;
    }
    if (policy === 'invest') for (const owner of Object.keys(treasury)) {
      const pick = chooseSubsistenceBuild({ snapshot: snap, balances: r.balances, labor: r.labor }, owner, NAMES, id => id);
      const tpl = pick && TEMPLATE[pick.buildingName];
      if (pick && tpl && treasury[owner] >= tpl.cost) { // real investment: paid, staffed, no magic output
        treasury[owner] -= tpl.cost;
        producers = [...producers, prod(`${pick.city}:b${n++}`, pick.city, tpl.recipe, tpl.cap, tpl.jobs)];
      }
    }
    cities = next;
    opening = r.balances.filter(b => b.stored > 0).map(b => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality }));
  }
  return { kpis, cities, treasury };
}
const at = (k: TurnKpi[], turn: number) => k.filter(x => x.turn === turn);

describe('long-horizon economy: growing world with investment does not starve', () => {
  const { kpis, cities } = simulate(200, 'invest');
  for (const T of [5, 20, 67, 200]) it(`turn ${T}: food ≥ 85 %, water ≥ 85 % in every city`, () => {
    for (const k of at(kpis, T)) { expect(k.food).toBeGreaterThanOrEqual(0.85); expect(k.water).toBeGreaterThanOrEqual(0.85); }
  });
  it('200 turns: population grew, almost no famine turns, investment followed growth', () => {
    for (const c of cities) expect(c.population).toBeGreaterThan(300);
    const faminTurns = kpis.filter(k => k.deaths > 0).length;
    expect(faminTurns / kpis.length).toBeLessThan(0.05);
    for (const id of ['player', 'ai1', 'ai2']) expect(at(kpis, 200).find(k => k.city === id)!.buildings).toBeGreaterThan(at(kpis, 1).find(k => k.city === id)!.buildings);
  });
});

describe('long-horizon economy: bad decisions and shocks still cause crisis', () => {
  it('no investment (TEST01/TEST02 pattern): starter capacity caps the city — stagnation with idle labour, far below the investing world', () => {
    const none = simulate(200, 'none'), inv = simulate(200, 'invest');
    for (const id of ['player', 'ai1', 'ai2']) {
      const pn = none.cities.find(c => c.id === id)!.population, pi = inv.cities.find(c => c.id === id)!.population;
      expect(pn).toBeLessThan(pi * 0.6);
    }
    // Shortage appears in at least one critical basket once growth hits starter capacity.
    expect(none.kpis.some(k => k.food < 0.98 || k.water < 0.98)).toBe(true);
  });
  it('crop-failure shock: destroying all farms causes real famine, then rebuilding recovers', () => {
    const { kpis } = simulate(120, 'invest', [{ turn: 60, city: 'player', destroy: 'staple_food' }]);
    const p = kpis.filter(k => k.city === 'player');
    expect(p.filter(k => k.turn >= 60 && k.turn <= 75).some(k => k.food < 0.85)).toBe(true);
    expect(p.find(k => k.turn === 120)!.food).toBeGreaterThanOrEqual(0.85);
  });
});
