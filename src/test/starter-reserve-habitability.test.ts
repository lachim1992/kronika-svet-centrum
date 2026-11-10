import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STARTER_RESERVE_GOODS, starterReserveFor, starterEffects, STARTER_STORAGE } from '../../supabase/functions/_shared/starterEconomy';
import { isHabitableStart, findStartPositions } from '../../supabase/functions/_shared/terrain';

const hex = (q: number, r: number, biomeFamily: string, o: any = {}) =>
  ({ q, r, seed: '', meanHeight: 30, moistureBand: 2, tempBand: 2, biomeFamily, coastal: false, hasRiver: false,
     riverDirection: null, isPassable: true, movementCost: 1, ...o });

describe('one-time starter reserve', () => {
  it('seeds only storable goods: ~2.5 turns of grain and peat for 100 souls, no water/fish', () => {
    const r = starterReserveFor(100);
    expect(r).toEqual({ raw_grain: 2.5, peat: 1.5 });
    for (const k of ['well_water', 'raw_fish']) expect(STARTER_RESERVE_GOODS.has(k)).toBe(false);
    expect(starterReserveFor(100, false)).toEqual({ raw_grain: 2.5 });
  });
  it('the existing storehouse contract itself carries no reserve (legacy upgrade never reseeds)', () => {
    expect((starterEffects(STARTER_STORAGE, 100) as any).starter_reserve).toBeUndefined();
  });
  it('adapter injects the reserve only inside the first-adoption branch', () => {
    const src = readFileSync('supabase/functions/_shared/economyAdapter.ts', 'utf8');
    const branch = src.indexOf('if(!opening){'), use = src.indexOf("provenance:'starter_reserve'");
    expect(branch).toBeGreaterThan(0);
    expect(use).toBeGreaterThan(branch);
    expect(src.slice(branch, use)).not.toContain('\n  }\n  //');
  });
});

describe('habitable start positions', () => {
  const map = (hs: any[]) => new Map(hs.map(h => [`${h.q},${h.r}`, h]));
  it('rejects dry inland and desert/tundra; accepts river-adjacent plains and coast', () => {
    const dry = hex(0, 0, 'plains'), river = hex(1, 0, 'plains', { hasRiver: true, isPassable: false });
    expect(isHabitableStart(dry, map([dry]))).toBe(false);
    expect(isHabitableStart(dry, map([dry, river]))).toBe(true);
    expect(isHabitableStart(hex(0, 0, 'desert'), map([hex(0, 0, 'desert'), river]))).toBe(false);
    expect(isHabitableStart(hex(0, 0, 'tundra'), map([river]))).toBe(false);
    expect(isHabitableStart(hex(0, 0, 'desert', { coastal: true }), new Map())).toBe(true);
  });
  it('finder replaces a dry candidate with a habitable one', () => {
    const hs: any[] = [];
    for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) hs.push(hex(q, r, 'plains'));
    hs.find(h => h.q === 5 && h.r === 5).hasRiver = true;
    hs.find(h => h.q === 5 && h.r === 5).isPassable = false;
    const m = map(hs);
    const pos = findStartPositions(hs, 8, 8, 0.4);
    expect(pos.length).toBeGreaterThan(0);
    for (const p of pos) expect(isHabitableStart(m.get(`${p.q},${p.r}`), m)).toBe(true);
  });
});
