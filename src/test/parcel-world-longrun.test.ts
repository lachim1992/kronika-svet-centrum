/**
 * STITCHED MODULE INTEGRATION (not full process-turn): frozen JV72O7 parcel geography evolved over turns with
 * real parcelProducers/parcelClosing ecology, resolveGoodsEconomy (labour, food/water/fuel, capex points),
 * computeSettlementGrowth (population), and the deployed AI runway chooser with live catalogue costs.
 * Excluded phases: battles, AI LLM diplomacy, wages/tax settlement SQL, trade-system route rebuild, events.
 * Reserve credit mirrors process-turn: reserve += Σ construction_points of owner's cities (once per turn).
 */
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/parcel-jv72o7-preflight.json';
import { resolveGoodsEconomy, produced, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { parcelProducers, parcelClosing } from '../../supabase/functions/_shared/parcelEconomy';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';
import { computeSettlementGrowth } from '../../supabase/functions/_shared/physics';
import { aiBuildRunway, chooseFallbackInvestment, ownsScalableEssential, templateProductionCost, ESSENTIAL_BUILD } from '../../supabase/functions/_shared/aiBuildBudget';

// Live building_templates (Nov 11 2026): capacity = Σ basket_outputs, jobs = ECONOMY.structureJobsBase (100).
const CATALOG = [
  { name: 'Studna', cost_wood: 5, cost_stone: 5, recipe: 'draw_water', capacity: 6 },
  { name: 'Farma', cost_wood: 15, cost_stone: 5, recipe: 'harvest_wheat', capacity: 7 },
  { name: 'Pila', cost_wood: 10, cost_stone: 5, cost_iron: 5, recipe: 'saw_timber', capacity: 6 },
  { name: 'Kamenolom', cost_wood: 15, cost_stone: 5, cost_iron: 5, recipe: 'quarry_stone', capacity: 4 },
];
const KASARNY = { name: 'Kasárny', cost_wood: 25, cost_stone: 15, cost_iron: 10 };
const STARTER = ['Osadní rybářství', 'Osadní studna', 'Lovecko-sběračská chata'].map(name => ({ name, effects: { starter_economy: true } }));
const rec = (k: string) => { const r = RECIPES.find(x => x.key === k)!; return { key: r.key, good: r.output, qty: r.qty, inputs: (r as any).inputs?.map((i: any) => ({ good: i.good, qty: i.qty })) ?? [], labor: (r as any).labor ?? 1, quality: 0, minQuality: 0 }; };

function structureProducer(city: any, b: typeof CATALOG[number], n: number) {
  const r = rec(b.recipe);
  return { id: `sim:${city.id}:${b.name}:${n}:${b.recipe}`, city: city.id, channel: 'facility', capacity: b.capacity, jobs: 100, recipe: r,
    allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: r.inputs.length === 0, distinctive: false };
}

type KPI = { turn: number; city: string; pop: number; food: number; water: number; fuel: number; points: number; reserve: number; built: string; employed: number; timber: number; stone: number };

function simulate(turns: number, invest: boolean) {
  const base = fixture.snapshot as unknown as Snapshot;
  const parcels = fixture.parcels.map((p: any) => ({ ...p, id: `preview:${p.grid_x}:${p.grid_y}:${p.parcel_index}` }));
  const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key: r.key, output_good_key: r.output, output_quantity: r.qty, labor_cost: 1 }]));
  const cities = base.cities.map(c => ({ ...c }));
  const owners = [...new Set(cities.map(c => c.owner))];
  const reserve: Record<string, number> = Object.fromEntries(owners.map(o => [o, o === 'AI Frakce 1' ? 0.041 : 50]));
  const owned: Record<string, any[]> = Object.fromEntries(cities.map(c => [c.id, [...STARTER]]));
  const extra: any[] = [];
  let ecology = {}, opening = base.opening; const kpi: KPI[] = []; const built: Record<string, string[]> = {};
  const stability: Record<string, number> = Object.fromEntries(cities.map(c => [c.id, 65]));
  for (let turn = 1; turn <= turns; turn++) {
    const sources = parcelProducers(parcels, fixture.terrain, cities as any, recipes, turn, ecology);
    const snap = { ...base, turn, cities, opening, producers: [...base.producers.filter((p: any) => !p.parcel), ...sources, ...extra] } as any;
    const r = resolveGoodsEconomy(snap);
    if (turn <= 3) expect(resolveGoodsEconomy(snap)).toEqual(r); // idempotent recompute = no re-credit
    for (const b of r.balances) expect(b.opening + produced(b) + b.imported).toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 6);
    for (const l of r.labor) expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce + 1e-6);
    const sat = (city: string, basket: string) => { const bs = r.balances.filter(b => b.city === city && base.goods.find(g => g.key === b.good)?.basket === basket); const d = bs.reduce((s, b) => s + b.demand, 0); return d ? 1 - bs.reduce((s, b) => s + b.unmet_demand, 0) / d : 1; };
    // Fiscal credit (process-turn rule): reserve += Σ construction_points, once.
    for (const c of cities) reserve[c.owner] += r.balances.filter(b => b.city === c.id).reduce((s, b) => s + (b.construction_points || 0), 0);
    // AI/owner investment: deployed runway rule, wants Kasárny, falls back to essential.
    if (invest) for (const c of cities) {
      const ess = CATALOG.filter(t => ESSENTIAL_BUILD.test(t.name));
      const why = aiBuildRunway({ template: KASARNY, reserve: reserve[c.owner], accrualPerTurn: 0, essentialTemplates: ess, ownsEssential: ownsScalableEssential(owned[c.id]) });
      const pick = why?.startsWith('deferred') ? chooseFallbackInvestment(CATALOG, owned[c.id], reserve[c.owner]) : null;
      if (pick) { reserve[c.owner] -= templateProductionCost(pick); owned[c.id].push({ name: pick.name }); extra.push(structureProducer(c, pick as any, turn)); (built[c.id] ||= []).push(`${pick.name}@t${turn}`); }
    }
    for (const c of cities) {
      const food = sat(c.id, 'staple_food'), water = sat(c.id, 'drinking_water');
      const g = computeSettlementGrowth({ id: c.id, name: c.name, owner_player: c.owner, status: 'ok', population_total: c.population, population_peasants: c.population, population_burghers: 0, population_clerics: 0, city_stability: stability[c.id], famine_turn: food < 0.5, development_level: 1 }, { needs: { food, water } });
      stability[c.id] = g.newStability; c.population = g.newPop; (c as any).classes = { ...(c as any).classes, peasants: g.newPop };
      if ([1, 5, 20, 50, 100, 200].includes(turn)) {
        const cb = r.balances.filter(b => b.city === c.id); const q = (k: string) => cb.filter(b => b.good === k).reduce((s, b) => s + produced(b), 0);
        kpi.push({ turn, city: c.name.slice(0, 12), pop: g.oldPop, food: +food.toFixed(3), water: +water.toFixed(3), fuel: +sat(c.id, 'fuel').toFixed(3),
          points: +cb.reduce((s, b) => s + (b.construction_points || 0), 0).toFixed(4), reserve: +reserve[c.owner].toFixed(3), built: (built[c.id] || []).join(','),
          employed: +(r.labor.find(l => l.city === c.id)?.employed_total ?? 0).toFixed(1), timber: +q('raw_timber').toFixed(3), stone: +q('raw_stone').toFixed(3) });
      }
    }
    ecology = parcelClosing(sources, r.diagnostics);
    opening = r.balances.filter(b => b.stored > 0).map(b => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots }));
  }
  return { kpi, reserve, built, cities };
}

describe('JV72O7 parcel world long-run (stitched integration)', () => {
  it('20 turns: no-investment vs invested', () => {
    const a = simulate(20, false), b = simulate(20, true);
    console.table(a.kpi); console.table(b.kpi);
    // starters with 50 points invest in farm on t1; AI1 (0.041) cannot and gets nothing for free
    const ai1 = b.cities.find(c => c.owner === 'AI Frakce 1')!;
    expect(b.built[ai1.id]).toBeUndefined();
    expect(Object.values(b.built).some(l => l[0]?.startsWith('Farma@t1'))).toBe(true);
    for (const k of b.kpi) expect(k.water).toBeGreaterThan(0.99);
  }, 120_000);
  it('200 turns: populations bounded, reserves never negative, AI1 recovery horizon measured', () => {
    const b = simulate(200, true); console.table(b.kpi.filter(k => [50, 100, 200].includes(k.turn)));
    for (const v of Object.values(b.reserve)) expect(v).toBeGreaterThanOrEqual(-1e-9);
    for (const c of b.cities) expect(Number.isFinite(c.population)).toBe(true);
  }, 600_000);
});
