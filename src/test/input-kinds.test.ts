/** Economy 2.0 A/B/C input classes on grain → flour → bread, through the canonical solver. */
import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { INPUT_KINDS, factorMultiplier, consumedPerBatch } from '../../supabase/functions/_shared/inputKinds';
import { RECIPES, auditProductionCatalog, goodReachability } from '../../supabase/functions/_shared/productionCatalog';
import { PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';

const good = (key: string, basket: string, price: number, stage: Good['stage'] = 'intermediate'): Good => ({
  key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0,
  storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0,
});
const city: City = { id: 'c', owner: 'p', name: 'c', cell: '0,0', population: 10, classes: { peasants: 10 }, soldiers: 0,
  stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 3, ideology: 'open_merchant', coastal: false };
const prod = (id: string, g: string, inputs: Producer['recipe']['inputs'], capacity: number, minQuality = 0): Producer => ({
  id, city: 'c', channel: 'node', capacity, craft: 3,
  recipe: { key: id, good: g, qty: 2, inputs, labor: 1, quality: 0, minQuality },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: false,
});
const MILL = (cap = 10) => prod('mill_grain', 'flour', [{ good: 'raw_grain', qty: 3 }, { good: 'metalwork_tools', qty: 1, kind: 'factor', wear: 0.05 }], cap);
const snap = (producers: Producer[], opening: Snapshot['opening']): Snapshot => ({ turn: 1, cities: [city], edges: [], fame: [], producers, opening,
  goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2), good('baked_staples', 'staple_food', 4),
    good('metalwork_tools', 'tools', 5, 'final'), good('peat', 'fuel', 1)] });
const bal = (r: ReturnType<typeof resolveGoodsEconomy>, g: string) => r.balances.find((b) => b.good === g)!;
const closes = (r: ReturnType<typeof resolveGoodsEconomy>) => { for (const b of r.balances)
  expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
    .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7); };

describe('B factor: tools at the mill', () => {
  it('full tool stock: only wear is consumed, never the whole factor; balance closes', () => {
    const r = resolveGoodsEconomy(snap([MILL()], [{ city: 'c', good: 'raw_grain', qty: 300, quality: 0 }, { city: 'c', good: 'metalwork_tools', qty: 20, quality: 1 }]));
    const d = r.diagnostics.find((x) => x.producer === 'mill_grain')! as any;
    expect(d.factors.capital).toBeCloseTo(1, 9);
    expect(d.factors.tools).toBe(1); // no city-level tool factor on top (no double charge)
    const flour = bal(r, 'flour').produced_node;
    expect(flour).toBeGreaterThan(0);
    const wear = flour * 1 * 0.05 / 2;
    expect(bal(r, 'metalwork_tools').consumed_as_input).toBeCloseTo(wear, 9);
    expect(bal(r, 'raw_grain').consumed_as_input).toBeCloseTo(flour * 3 / 2, 9);
    const lot = d.input_lots.find((l: any) => l.good === 'metalwork_tools');
    expect(lot.kind).toBe('factor'); expect(lot.qty).toBeCloseTo(wear, 9);
    // tools never set the output-quality ceiling (only A material does)
    expect(bal(r, 'flour').quality).toBeLessThanOrEqual(0 + PRODUCT_MARKET.qualityInheritanceHeadroom + 1e-9);
    // producer cost line charges wear only, not the full factor qty
    const line = d.margin.inputs.find((l: any) => l.good === 'metalwork_tools');
    expect(line.qty).toBeCloseTo(wear, 9);
    closes(r);
  });

  it('zero tools: productivity floor, not zero output; saturation: surplus tools add nothing', () => {
    const grain = { city: 'c', good: 'raw_grain', qty: 300, quality: 0 };
    const none = resolveGoodsEconomy(snap([MILL()], [grain]));
    const full = resolveGoodsEconomy(snap([MILL()], [grain, { city: 'c', good: 'metalwork_tools', qty: 5, quality: 0 }]));
    const lots = resolveGoodsEconomy(snap([MILL()], [grain, { city: 'c', good: 'metalwork_tools', qty: 500, quality: 0 }]));
    const half = resolveGoodsEconomy(snap([MILL()], [grain, { city: 'c', good: 'metalwork_tools', qty: 2.5, quality: 0 }]));
    const out = (r: typeof none) => bal(r, 'flour').produced_node;
    expect(out(none)).toBeCloseTo(out(full) * INPUT_KINDS.factorFloor, 6);
    expect(out(lots)).toBeCloseTo(out(full), 9); // saturates at requirement = capacity × 1/2 = 5
    expect(out(half)).toBeCloseTo(out(full) * factorMultiplier(0.5), 6);
    for (const r of [none, full, lots, half]) closes(r);
  });

  it('two mills cannot both count the same tools', () => {
    const r = resolveGoodsEconomy(snap([MILL(), { ...MILL(), id: 'mill_2' }],
      [{ city: 'c', good: 'raw_grain', qty: 600, quality: 0 }, { city: 'c', good: 'metalwork_tools', qty: 5, quality: 0 }]));
    const caps = ['mill_grain', 'mill_2'].map((id) => (r.diagnostics.find((d) => d.producer === id)! as any).factors.capital);
    caps.sort();
    expect(caps[0]).toBeCloseTo(INPUT_KINDS.factorFloor, 9); expect(caps[1]).toBeCloseTo(1, 9);
  });
});

describe('C operating input: fuel at the bakery', () => {
  const BAKE = (minQuality = 0) => prod('bake_staples', 'baked_staples', [{ good: 'flour', qty: 2 }, { good: 'peat', qty: 1, kind: 'operating' }], 10, minQuality);
  it('fuel is physically consumed per unit and gates output', () => {
    const none = resolveGoodsEconomy(snap([BAKE()], [{ city: 'c', good: 'flour', qty: 100, quality: 0 }]));
    expect(bal(none, 'baked_staples')?.produced_node ?? 0).toBe(0);
    const some = resolveGoodsEconomy(snap([BAKE()], [{ city: 'c', good: 'flour', qty: 100, quality: 0 }, { city: 'c', good: 'peat', qty: 0.05, quality: 0 }]));
    const bread = bal(some, 'baked_staples').produced_node;
    expect(bread).toBeGreaterThan(0);
    expect(bal(some, 'peat').consumed_as_input).toBeCloseTo(bread / 2, 9); // 1 peat per 2-bread batch
    expect(bal(some, 'flour').consumed_as_input).toBeCloseTo(bread, 9);
    const more = resolveGoodsEconomy(snap([BAKE()], [{ city: 'c', good: 'flour', qty: 100, quality: 0 }, { city: 'c', good: 'peat', qty: 200, quality: 0 }]));
    expect(bal(more, 'baked_staples').produced_node).toBeGreaterThan(bread); // fuel was the binding gate
    closes(some);
  });
  it('low-quality fuel neither caps bread quality nor is blocked by minQuality', () => {
    const r = resolveGoodsEconomy(snap([BAKE(2)], [{ city: 'c', good: 'flour', qty: 100, quality: 2 }, { city: 'c', good: 'peat', qty: 50, quality: 0 }]));
    expect(bal(r, 'baked_staples').produced_node).toBeGreaterThan(0);
    expect(bal(r, 'baked_staples').quality).toBeGreaterThan(0 + PRODUCT_MARKET.qualityInheritanceHeadroom);
    closes(r);
  });
});

describe('catalogue A/B/C contract', () => {
  it('mill_grain declares grain as A and tools as B; audit and flour reachability still pass', () => {
    const mill = RECIPES.find((r) => r.key === 'mill_grain')!;
    expect(mill.inputs.map((i) => [i.good, i.kind ?? 'material'])).toEqual([['raw_grain', 'material'], ['metalwork_tools', 'factor']]);
    expect(consumedPerBatch(mill.inputs[1])).toBeCloseTo(0.05, 9);
    expect(auditProductionCatalog()).toEqual([]);
    expect(goodReachability().find((x) => x.good === 'flour')!.reachable).toBe(true);
  });
});

describe('B factor creates derived replacement demand (once)', () => {
  const toolDemand = (r: ReturnType<typeof resolveGoodsEconomy>) => r.balances.filter((b) => b.good === 'metalwork_tools').reduce((s, b) => s + b.demand, 0);
  it('mill without tools demands the requirement gap + wear; full stock demands only wear', () => {
    const grain = { city: 'c', good: 'raw_grain', qty: 300, quality: 0 };
    const re = resolveGoodsEconomy(snap([MILL()], [grain])), empty = toolDemand(re);
    const staff = re.diagnostics.find((d) => d.producer === 'mill_grain')!.staffing_ratio!;
    const full = toolDemand(resolveGoodsEconomy(snap([MILL()], [grain, { city: 'c', good: 'metalwork_tools', qty: 5, quality: 0 }])));
    const none = toolDemand(resolveGoodsEconomy(snap([], [grain])));
    // requirement = capacity 10 × 1/2 = 5; wear = 5 × 0.05 = 0.25 at full staffing
    expect(empty - none).toBeCloseTo(5 + 0.25 * staff, 6);
    expect(full - none).toBeCloseTo(0.25 * staff, 6);
  });
});

describe('fully loaded producer account (wages + factor wear) in the canonical solver', () => {
  it('payroll = employed × local wage; VA = revenue − intermediate; surplus = VA − payroll; tool wear inside intermediate', async () => {
    const { localWage, PRODUCT_MARKET: PM } = await import('../../supabase/functions/_shared/productMarket');
    const r = resolveGoodsEconomy(snap([MILL()], [{ city: 'c', good: 'raw_grain', qty: 300, quality: 0 }, { city: 'c', good: 'metalwork_tools', qty: 5, quality: 0 }]));
    const d = r.diagnostics.find((x) => x.producer === 'mill_grain')! as any, m = d.margin, lab = r.labor.find((l) => l.city === 'c')!;
    expect(m.diagnostic_version).toBe(3);
    expect(lab.wage_rate).toBeGreaterThanOrEqual(PM.wage.base * PM.wage.floor - 1e-12);
    expect(lab.wage_rate).toBeLessThanOrEqual(PM.wage.base * PM.wage.ceiling + 1e-12);
    expect(m.payroll).toBeCloseTo(d.employed * lab.wage_rate, 9);
    expect(m.value_added).toBeCloseTo(m.revenue - m.cost, 9);
    expect(m.operating_surplus).toBeCloseTo(m.value_added - m.payroll, 9);
    expect(m.full_cost).toBeCloseTo(m.cost + m.payroll, 9);
    expect(m.unit_full_cost).toBeCloseTo(m.full_cost / d.realized, 9);
    const toolLine = m.inputs.find((l: any) => l.good === 'metalwork_tools');
    expect(m.capital_wear).toBeCloseTo(toolLine.qty * toolLine.price, 9);
    expect(m.cost).toBeGreaterThanOrEqual(m.capital_wear); // wear is part of intermediate, charged once
    // wage responds to the labour market
    expect(localWage({ supply: 100, vacancies: 50, unemployed: 0 })).toBeGreaterThan(localWage({ supply: 100, vacancies: 0, unemployed: 50 }));
  });
});

describe('city accounts report observed payroll (reconciliation)', () => {
  it('producer_payroll equals the sum of producer payrolls in that city', () => {
    const r = resolveGoodsEconomy(snap([MILL()], [{ city: 'c', good: 'raw_grain', qty: 300, quality: 0 }]));
    const acc = (r as any).cityAccounts?.find((a: any) => a.city === 'c') ?? (r as any).accounts?.find((a: any) => a.city === 'c');
    const pay = r.diagnostics.reduce((t, d) => t + ((d as any).margin?.payroll ?? 0), 0);
    expect(acc.producer_payroll).toBeCloseTo(pay, 9);
    expect(acc.producer_payroll).toBeGreaterThan(0);
  });
});
