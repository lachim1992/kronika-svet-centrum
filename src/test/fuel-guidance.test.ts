import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';
import { chooseFuelBuild } from '../../supabase/functions/_shared/fuelGuidance';
import { buildManagementReport } from '../../supabase/functions/_shared/management';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';
import { dispatchOutcome } from '../../supabase/functions/ai-faction-turn/dispatchOutcome';

const good = (key: string, basket: string, price: number, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number, owner = 'p'): City => ({ id, owner, name: id.toUpperCase(), cell: `${x},0`, population: 1000, classes: { peasants: 800, burghers: 200 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const bake = RECIPES.find(r => r.key === 'bake_staples')!;
const prod = (id: string, c: string, g: string, inputs: any[] = [], qty = 1): Producer => ({ id, city: c, channel: 'node', capacity: 10, jobs: 10, recipe: { key: id, good: g, qty, inputs, labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const snap = (opts: { timber?: boolean; remotePeat?: boolean; connected?: boolean; fuelLocal?: boolean } = {}): Snapshot => ({ turn: 2,
  cities: [city('a', 0), city('b', 5)],
  goods: [good('flour', 'staple_food', 3, 'intermediate'), good('baked_staples', 'staple_food', 4), good('peat', 'fuel', 1, 'raw'), good('charcoal', 'fuel', 2), good('raw_timber', 'construction', 1, 'raw')],
  producers: [prod('a:bake_staples', 'a', 'baked_staples', bake.inputs, 2), ...(opts.timber ? [prod('a:fell_timber', 'a', 'raw_timber')] : [])],
  edges: opts.connected ? [{ id: 'r', from: '0,0', to: '5,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }] : [],
  opening: [{ city: 'a', good: 'flour', qty: 100, quality: 0 }, ...(opts.remotePeat ? [{ city: 'b', good: 'peat', qty: 50, quality: 0 }] : []), ...(opts.fuelLocal ? [{ city: 'a', good: 'peat', qty: 100, quality: 0 }] : [])], fame: [] });
const T = new Set(['rašeliniště', 'uhlířství', 'dřevorubecký tábor']);
const nm = (id: string) => id.toUpperCase();

describe('fuel guidance (Ekonomika + Dev Mode + AI)', () => {
  it('no fuel: warning with missing goods, chain and feasible peat remedy; charcoal infeasible without timber; no stock created', () => {
    const l = resolveGoodsEconomy(snap());
    const [w] = l.fuelGuidance;
    expect(w.city).toBe('a'); expect(w.coverage).toBe(0); expect(w.missing_goods).toEqual(['charcoal', 'peat']);
    expect(w.chain.some(c => c.includes('burn_charcoal'))).toBe(true);
    expect(w.remedies.find(r => r.target === 'Rašeliniště')?.feasible).toBe(true);
    expect(w.remedies.find(r => r.target === 'Uhlířství')?.feasible).toBe(false);
    expect(l.balances.filter(b => b.good === 'peat' || b.good === 'charcoal').every(b => b.stored === 0)).toBe(true);
    expect(chooseFuelBuild(l.fuelGuidance, 'p', T, nm)).toMatchObject({ buildingName: 'Rašeliniště', cityName: 'A', good: 'peat' });
  });
  it('own timber source makes charcoal feasible and the AI prefers Uhlířství', () => {
    const l = resolveGoodsEconomy(snap({ timber: true }));
    expect(l.fuelGuidance[0].remedies.find(r => r.target === 'Uhlířství')?.feasible).toBe(true);
    expect(chooseFuelBuild(l.fuelGuidance, 'p', T, nm)?.buildingName).toBe('Uhlířství');
  });
  it('unreachable supply: remote peat stock listed as import remedy; reachable supply removes the warning', () => {
    const cut = resolveGoodsEconomy(snap({ remotePeat: true }));
    expect(cut.fuelGuidance[0].suppliers[0]).toMatchObject({ city: 'b', good: 'peat', same_owner: true });
    expect(cut.fuelGuidance[0].remedies.some(r => r.kind === 'import' && r.target === 'b')).toBe(true);
    expect(resolveGoodsEconomy(snap({ fuelLocal: true })).fuelGuidance).toEqual([]);
  });
  it('AI: other factions, missing templates and existing fuel buildings give no pick; rejected build is not success', () => {
    const l = resolveGoodsEconomy(snap());
    expect(chooseFuelBuild(l.fuelGuidance, 'q', T, nm)).toBeNull();
    expect(chooseFuelBuild(l.fuelGuidance, 'p', new Set(), nm)).toBeNull();
    const s = snap(); s.producers.push(prod('a:cut_peat', 'a', 'peat'));
    expect(resolveGoodsEconomy(s).fuelGuidance.find(w => w.city === 'a')?.remedies.find(r => r.target === 'Rašeliniště')?.feasible ?? false).toBe(false);
    expect(dispatchOutcome({ ok: false, error: 'insufficient' } as any).startsWith('rejected')).toBe(true);
  });
  it('same canonical warning reaches the owner report (with alert) and the Dev snapshot', () => {
    const s = snap(), l = resolveGoodsEconomy(s);
    const report = buildManagementReport(s, l, { player_name: 'p' }) as any;
    expect(report.fuel_guidance).toEqual(l.fuelGuidance);
    expect(report.alerts.some((a: any) => a.id === 'fuel:a' && a.levers.includes('Postavit Rašeliniště'))).toBe(true);
    expect(buildManagementReport(s, l, { player_name: 'q' }).fuel_guidance).toEqual([]);
    const dev = buildSnapshot({ ...l, snapshot: { ...s, producers: s.producers.map(p => ({ ...p, node: '' })) } } as any, null);
    expect(dev.fuel_guidance).toEqual(l.fuelGuidance);
  });
});
