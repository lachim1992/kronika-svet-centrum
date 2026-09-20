import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

// LABOR / JOBS / CAPACITY ECONOMY INVARIANTS (tests A–U of the Economy Integrity pass).
// Population supplies labour and demand. Structures create jobs, capacity and input demand.
// Only realized output (staffed capacity × delivered inputs) creates physical goods.

const good = (key: string, basket = 'metalwork', price = 10, stage: Good['stage'] = 'intermediate'): Good =>
  ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0,
     storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0 });
const city = (id: string, x: number, population = 1000): City =>
  ({ id, owner: 'p', name: id, cell: `${x},0`, population, classes: { peasants: population }, soldiers: 0,
     stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0,
     ideology: 'open_merchant', coastal: false });
const producer = (id: string, c: string, g: string, capacity = 10, inputs: { good: string; qty: number }[] = [],
                  extra: Partial<Producer> = {}): Producer =>
  ({ id, city: c, channel: 'facility', capacity, recipe: { key: id, good: g, qty: 1, inputs, labor: 1, quality: 0, minQuality: 0 },
     allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false, ...extra });

const chain = (): Snapshot => ({
  turn: 1,
  cities: [city('mine', 0), city('forge', 1)],
  goods: [good('ore'), good('ingot', 'metalwork', 20), good('tools', 'tools', 35, 'final')],
  producers: [producer('ore', 'mine', 'ore'), producer('tools', 'forge', 'tools', 10, [{ good: 'ore', qty: 1 }])],
  edges: [{ id: 'road', from: '0,0', to: '1,0', cost: 1, capacity: 100, mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [], fame: [],
});
const diag = (r: ReturnType<typeof resolveGoodsEconomy>, id: string) => r.diagnostics.find(d => d.producer === id)!;

describe('labour, jobs and capacity economy', () => {
  it('A/B: population alone creates no market goods and a city without producers has demand but no supply', () => {
    expect(ECONOMY.householdProduction).toBe(false);
    const s = chain();
    s.producers = [];
    s.cities[0].population = 10000;
    s.cities[0].classes = { peasants: 10000 };
    const r = resolveGoodsEconomy(s);
    for (const b of r.balances) {
      expect(produced(b)).toBe(0);
      expect(b.produced_household).toBe(0);
    }
    expect(r.balances.some(b => b.unmet_demand > 0)).toBe(true);
  });

  it('C/D: a producer without workers or without inputs realizes nothing', () => {
    const noWorkers = chain();
    noWorkers.cities[0].population = 0;
    noWorkers.cities[0].classes = { peasants: 0 };
    expect(diag(resolveGoodsEconomy(noWorkers), 'ore').realized).toBe(0);

    const noInputs = chain();
    noInputs.producers = [producer('tools', 'forge', 'tools', 10, [{ good: 'ore', qty: 1 }])];
    expect(diag(resolveGoodsEconomy(noInputs), 'tools').realized).toBe(0);
  });

  it('E/F/G: staffing scales potential output, input demand follows potential, inputs raise realized output', () => {
    const full = resolveGoodsEconomy(chain());
    const forgeFull = diag(full, 'tools');
    expect(forgeFull.jobs_capacity).toBeGreaterThan(0);
    expect(forgeFull.potential_output).toBeGreaterThan(0);
    expect(forgeFull.inputs.find((i: any) => i.good === 'ore')!.required).toBeGreaterThanOrEqual(forgeFull.realized);

    const half = chain();
    // Shrink the labour pool so the crafting sector can staff only part of the jobs.
    const jobs = forgeFull.jobs_capacity;
    const sector = ECONOMY.sectors.crafting;
    half.cities[1].population = Math.round(jobs / sector / 2);
    half.cities[1].classes = { peasants: half.cities[1].population };
    const halfForge = diag(resolveGoodsEconomy(half), 'tools');
    expect(halfForge.staffing_ratio).toBeLessThan(1);
    expect(halfForge.potential_output).toBeLessThan(forgeFull.potential_output);

    const starved = chain();
    starved.producers[0].capacity = 2;
    const starvedForge = diag(resolveGoodsEconomy(starved), 'tools');
    expect(starvedForge.jobs_capacity).toBeCloseTo(forgeFull.jobs_capacity);
    expect(starvedForge.realized).toBeLessThan(forgeFull.realized);
    expect(starvedForge.bottleneck).toBe('ore');
  });

  it('H–L: labour accounting never employs a worker twice and derives vacancies and unemployment', () => {
    const s = chain();
    s.producers.push(producer('ore2', 'mine', 'ore', 10));
    const r = resolveGoodsEconomy(s);
    for (const l of r.labor!) {
      expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce + 1e-6);
      expect(l.employed_total).toBeLessThanOrEqual(l.jobs_capacity + 1e-6);
      expect(l.vacancies_total).toBeCloseTo(Math.max(0, l.jobs_capacity - l.employed_total));
      expect(l.unemployed_total).toBeGreaterThanOrEqual(0);
      const employedBySector = Object.values(l.sectors).reduce((n, s) => n + s.employed, 0);
      expect(employedBySector).toBeCloseTo(l.employed_total);
      for (const sector of Object.values(l.sectors)) {
        expect(sector.employed).toBeLessThanOrEqual(sector.jobs_capacity + 1e-6);
        expect(sector.employed).toBeLessThanOrEqual(sector.labor_supply + 1e-6);
      }
    }
  });

  it('M/N: industrial input demand travels the canonical routes and a broken route stops the dependent producer', () => {
    const connected = resolveGoodsEconomy(chain());
    expect(connected.flows.some(f => f.good === 'ore' && f.purpose === 'production_input')).toBe(true);
    expect(diag(connected, 'tools').realized).toBeGreaterThan(0);

    const cut = chain();
    cut.edges = [];
    const blocked = resolveGoodsEconomy(cut);
    expect(blocked.flows.some(f => f.good === 'ore')).toBe(false);
    expect(diag(blocked, 'tools').realized).toBe(0);
  });

  it('O/P: processing creates intermediate value without double counting, shortages stay unmet', () => {
    const r = resolveGoodsEconomy(chain());
    const gross = r.metrics.reduce((n, m) => n + m.gross_output_value, 0);
    const intermediate = r.metrics.reduce((n, m) => n + m.intermediate_value, 0);
    const added = r.metrics.reduce((n, m) => n + m.value_added_gdp, 0);
    expect(intermediate).toBeGreaterThan(0);
    expect(added).toBeCloseTo(gross - intermediate);
    expect(added).toBeLessThan(gross);

    const noSupply = chain();
    noSupply.producers = [];
    const unmet = resolveGoodsEconomy(noSupply).balances.filter(b => b.demand > 0);
    expect(unmet.length).toBeGreaterThan(0);
    for (const b of unmet) expect(b.unmet_demand).toBeCloseTo(b.demand);
  });

  it('R/U: the same state resolves identically and repeated resolutions stay finite and non-negative', () => {
    const s = chain();
    expect(resolveGoodsEconomy(s)).toEqual(resolveGoodsEconomy(s));
    let state = chain();
    for (let turn = 0; turn < 30; turn++) {
      const r = resolveGoodsEconomy({ ...state, turn: turn + 1 });
      for (const b of r.balances) {
        expect(Number.isFinite(produced(b))).toBe(true);
        expect(produced(b)).toBeGreaterThanOrEqual(0);
        expect(b.stored).toBeGreaterThanOrEqual(0);
      }
      state = { ...state, opening: r.balances.map(b => ({ city: b.city, good: b.good, qty: b.stored })) };
    }
  });
});
