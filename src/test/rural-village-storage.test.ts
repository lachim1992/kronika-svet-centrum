import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { villageStorageLevels, villageStorageForCity, VILLAGE_STORAGE_LEVELS } from '../../supabase/functions/_shared/ruralSettlement';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const good: Good = { key: 'raw_timber', basket: 'construction', price: 5, stage: 'raw', storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0.05, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0 } as any;
const city = (storage: number): City => ({ id: 'c', owner: 'p', name: 'c', cell: '0,0', population: 0, classes: { peasants: 0 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 0, storage, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false } as any);
const snap = (storage: number): Snapshot => ({ turn: 2, cities: [city(storage)], goods: [good], producers: [], edges: [], opening: [{ city: 'c', good: 'raw_timber', qty: 200, quality: 0 } as any], fame: [] } as any);
const bal = (storage: number) => resolveGoodsEconomy(snap(storage)).balances.find((b: any) => b.city === 'c' && b.good === 'raw_timber')! as any;

describe('village granary = extra levels of the city canonical storage', () => {
  it('levels 1/2/3 add 0.25/0.5/1 warehouse levels, clamped', () => {
    expect([1, 2, 3].map(villageStorageLevels)).toEqual([0.25, 0.5, 1]);
    expect(villageStorageLevels(9)).toBe(VILLAGE_STORAGE_LEVELS[3]);
    expect(villageStorageLevels(0)).toBe(0);
  });
  it('only villages of the city owner and that city count', () => {
    const v = [{ city_id: 'c', owner_player: 'p', level: 3 }, { city_id: 'c', owner_player: 'ai', level: 3 }, { city_id: 'x', owner_player: 'p', level: 2 }];
    expect(villageStorageForCity(v, { id: 'c', owner: 'p' })).toBe(1);
    expect(villageStorageForCity(v, { id: 'c', owner: null })).toBe(0);
  });
  it('solver: more storage keeps more stock, less overflow and decay, same conservation', () => {
    const base = bal(1), withVillage = bal(1 + villageStorageLevels(3));
    expect(withVillage.stored).toBeGreaterThan(base.stored);
    expect(withVillage.lost_discard).toBeLessThan(base.lost_discard);
    expect(withVillage.lost_decay).toBeLessThan(base.lost_decay);
    for (const b of [base, withVillage]) expect(b.stored + b.lost_spoilage + b.capex).toBeCloseTo(200, 6); // nothing minted
  });
});
