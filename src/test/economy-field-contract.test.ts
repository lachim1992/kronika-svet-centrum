import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { CITY_ACCOUNT_FIELDS, CITY_ACCOUNT_UNMAPPED_OK, formatField, fieldByKey } from '@/lib/economyFieldContract';

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
    const b = accounts.find(a => a.city === 'b')!, a = accounts.find(x => x.city === 'a')!;
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
