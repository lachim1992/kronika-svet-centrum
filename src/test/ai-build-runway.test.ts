import { describe, it, expect } from 'vitest';
import { aiBuildRunway, chooseFallbackInvestment, ownsScalableEssential, templateProductionCost, ESSENTIAL_BUILD } from '../../supabase/functions/_shared/aiBuildBudget';

// Live catalogue (production cost = wood+stone+iron): Studna 10, Rašeliniště 15, Farma 20, Rybářství 20, Pila 20, Kamenolom 25, Kasárny 50.
const T = [
  { id: 'st', name: 'Studna', cost_wood: 5, cost_stone: 5 }, { id: 'ra', name: 'Rašeliniště', cost_wood: 10, cost_stone: 5 },
  { id: 'fa', name: 'Farma', cost_wood: 15, cost_stone: 5 }, { id: 'ry', name: 'Rybářství', cost_wood: 15, cost_stone: 5 },
  { id: 'pi', name: 'Pila', cost_wood: 15, cost_stone: 5 }, { id: 'ka', name: 'Kamenolom', cost_wood: 15, cost_stone: 10 },
];
const KAS = { id: 'kas', name: 'Kasárny', cost_wood: 25, cost_stone: 15, cost_iron: 10 };
const ESS = T.filter(t => ESSENTIAL_BUILD.test(t.name));
// Exact live JV72O7 AI Frakce 1 starter set.
const STARTER = ['Osadní rybářství', 'Osadní studna', 'Lovecko-sběračská chata', 'Osadní sklad', 'Osadní sběr paliva'].map(name => ({ name, effects: { starter_economy: true } }));

/** Mirrors ai-faction-turn build_building: guard, then same-turn fallback; returns what would be dispatched. */
function decide(proposed: any, owned: any[], reserve: number, accrual: number) {
  const why = aiBuildRunway({ template: proposed, reserve, accrualPerTurn: accrual, essentialTemplates: ESS, ownsEssential: ownsScalableEssential(owned) });
  if (!why) return { build: proposed, why: null };
  if (!why.startsWith('deferred')) return { build: null, why };
  return { build: chooseFallbackInvestment(T, owned, reserve), why };
}

describe('AI runway decision (pure)', () => {
  it('starter structures alone do not unlock barracks; Farma dispatched instead, 20 spent, 30 left', () => {
    expect(ownsScalableEssential(STARTER)).toBe(false);
    const d = decide(KAS, STARTER, 50, 0.041);
    expect(d.why).toMatch(/deferred_runway/);
    expect(d.build?.name).toBe('Farma');
    expect(50 - templateProductionCost(d.build)).toBe(30);
  });
  it('mature city with a real farm can build barracks', () => {
    expect(decide(KAS, [...STARTER, { name: 'Farma', effects: {} }], 50, 0.041).build?.name).toBe('Kasárny');
  });
  it('exhausted AI gets no top-up and no build', () => {
    const d = decide(KAS, STARTER, 0.041, 0.041);
    expect(d.build).toBeNull(); expect(d.why).toMatch(/insufficient/);
  });
  it('fallback skips already-owned farm and picks Pila; none affordable → null', () => {
    expect(chooseFallbackInvestment(T, [{ name: 'Farma' }], 25)?.name).toBe('Pila');
    expect(chooseFallbackInvestment(T, STARTER, 5)).toBeNull();
  });
  it('repeated turn after the farm purchase cannot spend the same points twice', () => {
    let reserve = 50; const owned: any[] = [...STARTER];
    const a = decide(KAS, owned, reserve, 0.041); reserve -= templateProductionCost(a.build); owned.push({ name: a.build.name, effects: {} });
    const b = decide(KAS, owned, reserve, 0.041); // now owns farm → barracks allowed only if affordable
    expect(b.build).toBeNull(); expect(reserve).toBe(30);
  });
});

describe('Reserve illustration (NOT a solver: accrual held at measured 0.041, farm output not modelled)', () => {
  for (const turns of [20, 200]) it(`${turns} turns`, () => {
    let reserve = 50; const owned: any[] = [...STARTER]; const built: string[] = [];
    for (let t = 1; t <= turns; t++) {
      const d = decide(KAS, owned, reserve, 0.041);
      if (d.build && !(d.build.name === 'Kasárny' && built.includes('Kasárny'))) { reserve -= templateProductionCost(d.build); built.push(d.build.name); owned.push({ name: d.build.name, effects: {} }); }
      reserve += 0.041;
    }
    expect(built[0]).toBe('Farma');
    expect(reserve).toBeGreaterThanOrEqual(0);
    expect(reserve).toBeCloseTo(30 + 0.041 * turns - (built.includes('Kasárny') ? 50 : 0), 6);
  });
});
