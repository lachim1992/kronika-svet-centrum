import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { CITY_ACCOUNT_FIELDS, CITY_ACCOUNT_UNMAPPED_OK, PRODUCER_COST_FIELDS, PRODUCER_COST_UNMAPPED_OK, formatField, fieldByKey } from '@/lib/economyFieldContract';
import { producerAccount } from '../../supabase/functions/_shared/productMarket';
import { buildManagementReport } from '../../supabase/functions/_shared/management';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';

const good = (key: string, basket: string, price: number, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: 1000, classes: { peasants: 800, burghers: 200 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const prod = (id: string, c: string, g: string, inputs: { good: string; qty: number }[] = []): Producer => ({ id, city: c, channel: 'node', capacity: 10, jobs: 10, recipe: { key: id, good: g, qty: 1, inputs, labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const snap = (): Snapshot => ({ turn: 2, cities: [city('a', 0), city('b', 1)], goods: [good('raw_grain', 'staple_food', 2), good('flour', 'staple_food', 3, 'intermediate'), good('baked_staples', 'staple_food', 4)],
  producers: [prod('grain', 'a', 'raw_grain'), prod('flour', 'b', 'flour', [{ good: 'raw_grain', qty: 1 }]), prod('bread', 'b', 'baked_staples', [{ good: 'flour', qty: 1 }])],
  edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [], settledWages: { b: 3 } });

describe('economy field contract (Economy tab + Dev Mode)', () => {
  const accounts = resolveGoodsEconomy(snap()).cityAccounts as Record<string, unknown>[];
  const engineKeys = new Set(accounts.flatMap(a => Object.keys(a)));
  it('every canonical cityAccounts field is mapped or explicitly exempt — new engine fields must reach both tabs', () => {
    const mapped = new Set(CITY_ACCOUNT_FIELDS.map(f => f.key));
    expect([...engineKeys].filter(k => !mapped.has(k) && !CITY_ACCOUNT_UNMAPPED_OK.has(k))).toEqual([]);
  });
  it('no stale UI mapping: every mapped/exempt key is emitted by the engine', () => {
    for (const f of CITY_ACCOUNT_FIELDS) expect(engineKeys.has(f.key), f.key).toBe(true);
    for (const k of CITY_ACCOUNT_UNMAPPED_OK) expect(engineKeys.has(k), k).toBe(true);
  });
  it('labels the basis per city from canonical data', () => {
    const b = accounts.find(a => a.city === 'b'), a = accounts.find(x => x.city === 'a');
    expect(b).toBeDefined(); expect(a).toBeDefined();
    expect(formatField(fieldByKey('labor_income_basis'), b).text).toBe('vyplacené mzdy');
    expect(formatField(fieldByKey('labor_income_basis'), a).text).toBe('odhad z HDP');
    expect(formatField(fieldByKey('settled_wage_income'), a)).toEqual({ text: 'zatím není', missing: true });
  });
  it('distinguishes missing field, not-yet value and real zero', () => {
    const w = fieldByKey('settled_wage_income');
    expect(formatField(w, {})).toEqual({ text: 'chybí', missing: true });
    expect(formatField(w, { settled_wage_income: 0 })).toEqual({ text: '0.0', missing: false });
  });
  });
  it('echoes committed arrears and producer retained cash per city without recomputing', () => {
    const s = { ...snap(), settlement: { b: { arrears_closing: 1.5, producer_retained: 4, producer_cash_closing: 9 } } };
    const acc = resolveGoodsEconomy(s).cityAccounts as Record<string, unknown>[];
    const b = acc.find(x => x.city === 'b')!, a = acc.find(x => x.city === 'a')!;
    expect(b.settled_wage_arrears).toBe(1.5);
    expect(b.settled_producer_retained).toBe(4);
    expect(b.settled_producer_cash).toBe(9);
    expect(a.settled_wage_arrears).toBeNull();
  });

describe('producer cost field contract: direct canonical paths in both views', () => {
  const paths = (r: Record<string, unknown>, prefix = ''): string[] => Object.entries(r).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value != null && typeof value === 'object' ? paths(value as Record<string, unknown>, path) : [path];
  });
  it('covers every producerAccount leaf, with no stale paths or exemptions', () => {
    const account = producerAccount({ realized: 5, revenue: 40, intermediate: 17, capitalWear: 2, employed: 10, wage: 0.3, material: 10, operating: 5 });
    const keys = new Set(paths(account)), mapped = new Set(PRODUCER_COST_FIELDS.map(f => f.key));
    expect([...keys].filter(k => !mapped.has(k) && !PRODUCER_COST_UNMAPPED_OK.has(k))).toEqual([]);
    for (const key of [...mapped, ...PRODUCER_COST_UNMAPPED_OK]) expect(keys.has(key), key).toBe(true);
  });
  it('preserves the exact A/B/C margin through owner report and Dev projection without mutation', () => {
    const snapshot = snap();
    snapshot.cities[0].owner = 'other';
    snapshot.goods.push(good('metalwork_tools', 'tools', 3, 'intermediate'), good('fuel', 'fuel', 1, 'intermediate'));
    snapshot.opening.push({ city: 'b', good: 'raw_grain', qty: 100, quality: 1 }, { city: 'b', good: 'metalwork_tools', qty: 20, quality: 1 }, { city: 'b', good: 'fuel', qty: 20, quality: 0 });
    snapshot.producers[1].recipe.inputs.push({ good: 'metalwork_tools', qty: 1, kind: 'factor', wear: 0.05 }, { good: 'fuel', qty: 1, kind: 'operating' });
    const ledger = resolveGoodsEconomy(snapshot), before = JSON.stringify(ledger);
    const report = buildManagementReport(snapshot, ledger, { player_name: 'p' });
    const dev = buildSnapshot({ ...ledger, snapshot: { ...snapshot, producers: snapshot.producers.map(p => ({ ...p, node: p.node ?? '' })) } }, null);
    expect(report.producers.map(p => p.producer)).not.toContain('grain');
    const owner = report.producers.find(p => p.producer === 'flour');
    const diagnostic = ledger.diagnostics.find(d => d.producer === 'flour') as unknown as { margin: Record<string, unknown> };
    const developer = dev.costs.find(p => p.producer === 'flour');
    expect(owner).toBeDefined(); expect(developer).toBeDefined();
    expect(owner?.realized).toBeGreaterThan(0);
    expect(owner?.margin).toBe(diagnostic.margin);
    expect(developer?.canonical_margin).toBe(diagnostic.margin);
    for (const field of PRODUCER_COST_FIELDS) {
      expect(formatField(field, owner?.margin), field.key).toEqual(formatField(field, developer?.canonical_margin as Record<string, unknown>));
      expect(formatField(field, owner?.margin).missing, field.key).toBe(false);
    }
    const breakdown = diagnostic.margin.cost_breakdown as { material: number; operating: number; factor_wear: number; payroll_imputed: number };
    expect(breakdown.material).toBeGreaterThan(0); expect(breakdown.operating).toBeGreaterThan(0); expect(breakdown.factor_wear).toBeGreaterThan(0);
    expect(breakdown.material + breakdown.operating + breakdown.factor_wear).toBeCloseTo(Number(diagnostic.margin.cost), 9);
    expect(Number(diagnostic.margin.full_cost)).toBeCloseTo(Number(diagnostic.margin.cost) + breakdown.payroll_imputed, 9);
    expect(diagnostic.margin.payroll_basis).toBe('imputed'); expect(diagnostic.margin.cash_settled).toBe(false);
    expect(JSON.stringify(ledger)).toBe(before);
  });
  it('does not invent modern costs for legacy margins; zero, undefined unit cost and false stay distinct', () => {
    const material = PRODUCER_COST_FIELDS.find(f => f.key === 'cost_breakdown.material');
    const unit = PRODUCER_COST_FIELDS.find(f => f.key === 'cost_breakdown.unit.material');
    const cash = PRODUCER_COST_FIELDS.find(f => f.key === 'cash_settled');
    if (!material || !unit || !cash) throw new Error('Required cost fields missing');
    expect(formatField(material, { cost: 8 })).toEqual({ text: 'chybí', missing: true });
    expect(formatField(material, { cost_breakdown: { material: 0 } })).toEqual({ text: '0.0', missing: false });
    expect(formatField(unit, { cost_breakdown: { unit: { material: null } } })).toEqual({ text: 'zatím není', missing: true });
    expect(formatField(cash, { cash_settled: false })).toEqual({ text: 'ne', missing: false });
    const legacy = buildSnapshot({ diagnostics: [{ producer: 'x', good: 'flour', capacity: 1, realized: 1, factors: {}, blocked: null, margin: { cost: 8 } }],
      snapshot: { producers: [{ id: 'x', city: 'b', node: '', channel: 'facility', source: false, capacity: 1, recipe: { key: 'x', good: 'flour', qty: 1, inputs: [] } }] } }, null);
    expect(legacy.costs[0].canonical_margin).toEqual({ cost: 8 });
    expect(formatField(material, legacy.costs[0].canonical_margin as Record<string, unknown>).missing).toBe(true);
  });
});
