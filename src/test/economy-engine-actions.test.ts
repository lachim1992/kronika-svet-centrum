import { describe, expect, it } from 'vitest';
import { resolveGoodsEconomy, type Snapshot, type Good, type Producer } from '../../supabase/functions/_shared/goodsEconomy';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';

const good = (key: string, basket: string, stage: string, price = 10): Good => ({
  key, basket, stage, price, storable: true, bulk: 1, density: 1,
  perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 0,
  strategic: 0, prestige: 0, transshipment: 0, finalUse: false, household: false,
});
const producer = (key: string, id: string, capacity: number): Producer => {
  const r = RECIPES.find(r => r.key === key);
  if (!r) throw new Error('Missing catalogue recipe ' + key);
  return {
    id, city: 'city', channel: 'facility', capacity,
    recipe: { key, good: r.output, qty: r.qty, inputs: r.inputs, labor: 1, quality: 1, minQuality: 0 },
    allocation: 1, staffing: 1, logistics: 1, mastery: 1,
    source: r.role === 'source', distinctive: false, jobs: 1,
  };
};
const base = (): Snapshot => ({
  turn: 1,
  goods: [
    good('raw_ore', 'metals', 'raw'), good('iron_ingot', 'metals', 'processed'),
    good('raw_timber', 'construction', 'raw'), good('lumber', 'construction', 'processed'),
    good('metalwork_tools', 'tools', 'final'),
  ],
  cities: [{
    id: 'city', owner: 'player', name: 'Test City', cell: '0,0',
    population: 1000, classes: { peasants: 1000 }, soldiers: 0,
    stability: 1, irrigation: 0,
    labor: { mining: 100, crafting: 100, industry: 100, logging: 100 },
    market: 0, storage: 10000, admin: 0, security: 1, guild: 0,
    ideology: 'balanced', coastal: false,
  } as Snapshot['cities'][number]],
  producers: [
    producer('mine_iron', 'mine', 2),
    producer('smelt_iron', 'smelter', 1),
    producer('forge_tools', 'smith', 2),
  ],
  edges: [], opening: [{ city: 'city', good: 'lumber', qty: 1, quality: 1 }],
  fame: [],
});
const output = (result: ReturnType<typeof resolveGoodsEconomy>, id: string) =>
  result.diagnostics.find(d => d.producer === id)?.realized ?? 0;
const assertConservation = (result: ReturnType<typeof resolveGoodsEconomy>) => {
  for (const b of result.balances) {
    const produced = b.produced_household + b.produced_node + b.produced_facility + b.produced_district;
    expect(b.opening + produced + b.imported - b.exported -
      b.consumed_household - b.consumed_state - b.consumed_as_input -
      b.lost_spoilage - b.stored - b.capex).toBeCloseTo(0, 6);
  }
};
describe('Actual resolveGoodsEconomy deterministic integration', () => {
  it('produces tools with a physical ledger and no conservation violations', () => {
    const snapshot = base();
    const result = resolveGoodsEconomy(snapshot);
    expect(output(result, 'mine')).toBeGreaterThan(0);
    expect(output(result, 'smelter')).toBeGreaterThan(0);
    expect(output(result, 'smith')).toBeGreaterThan(0);
    assertConservation(result);
  });
  it('does not forge tools when lumber is absent', () => {
    const snapshot = base();
    snapshot.opening = [];
    const result = resolveGoodsEconomy(snapshot);
    expect(output(result, 'smith')).toBe(0);
    assertConservation(result);
  });
  it('is deterministic and does not mutate its input snapshot', () => {
    const snapshot = base();
    const before = JSON.stringify(snapshot);
    expect(resolveGoodsEconomy(snapshot)).toEqual(resolveGoodsEconomy(snapshot));
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
