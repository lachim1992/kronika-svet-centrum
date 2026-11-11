import { describe, it, expect } from 'vitest';
import { aiBuildRunway, templateProductionCost } from '../../supabase/functions/_shared/aiBuildBudget';

// Live catalogue production costs (wood+stone+iron), Nov 11 2026.
const T = {
  Studna: { name: 'Studna', cost_wood: 5, cost_stone: 5 }, Farma: { name: 'Farma', cost_wood: 15, cost_stone: 5 },
  Pila: { name: 'Pila', cost_wood: 15, cost_stone: 5 }, Kasárny: { name: 'Kasárny', cost_wood: 25, cost_stone: 15, cost_iron: 10 },
};
const essentials = [T.Studna, T.Farma, T.Pila];
const RAW_ACCRUAL = 0.041; // AI1 live committed raw-construction accrual per turn

/** Reserve-trajectory scenario (NOT full process-turn): one build attempt per turn, real costs, measured accrual. */
function run(turns: number, guard: boolean, wantFirst: any) {
  let reserve = 50, ownsEssential = false, accrual = RAW_ACCRUAL; const built: string[] = []; let stuck = 0;
  for (let t = 1; t <= turns; t++) {
    let want = built.length === 0 ? wantFirst : ownsEssential ? T.Kasárny : T.Farma;
    if (guard && aiBuildRunway({ template: want, reserve, accrualPerTurn: accrual, essentialTemplates: essentials, ownsEssential })?.startsWith('deferred')) want = T.Farma; // chooser falls back to essential
    if (built.includes('Kasárny') && want === T.Kasárny) { reserve += accrual; continue; }
    const why = guard ? aiBuildRunway({ template: want, reserve, accrualPerTurn: accrual, essentialTemplates: essentials, ownsEssential })
      : (reserve < templateProductionCost(want) ? 'insufficient' : null);
    if (!why) { reserve -= templateProductionCost(want); built.push(want.name); if (/Farma|Pila|Studna/.test(want.name)) { ownsEssential = true; accrual = Math.max(accrual, 0.2); } }
    else if (!ownsEssential) stuck++;
    reserve += accrual;
  }
  return { reserve, built, stuck };
}

describe('AI construction capital trap', () => {
  it('reproduces the trap without guard: barracks first, farm unaffordable for >200 turns', () => {
    const r = run(200, false, T.Kasárny);
    expect(r.built[0]).toBe('Kasárny');
    expect(r.built).not.toContain('Farma');
    expect(r.stuck).toBeGreaterThan(190);
  });
  it('guard defers barracks, builds farm on turn 1, barracks later once runway allows', () => {
    const r = run(200, true, T.Kasárny);
    expect(r.built[0]).toBe('Farma');
    expect(r.built).toContain('Kasárny');
    expect(r.stuck).toBe(0);
  });
  it('rules: unaffordable rejected; essential always allowed; militarist allowed with runway', () => {
    expect(aiBuildRunway({ template: T.Farma, reserve: 10, accrualPerTurn: 1, essentialTemplates: essentials, ownsEssential: false })).toMatch(/insufficient/);
    expect(aiBuildRunway({ template: T.Farma, reserve: 20, accrualPerTurn: 0, essentialTemplates: essentials, ownsEssential: false })).toBeNull();
    expect(aiBuildRunway({ template: T.Kasárny, reserve: 50, accrualPerTurn: 0.041, essentialTemplates: essentials, ownsEssential: false })).toMatch(/deferred_runway/);
    expect(aiBuildRunway({ template: T.Kasárny, reserve: 60, accrualPerTurn: 0.041, essentialTemplates: essentials, ownsEssential: false })).toBeNull();
    expect(aiBuildRunway({ template: T.Kasárny, reserve: 50, accrualPerTurn: 0.041, essentialTemplates: essentials, ownsEssential: true })).toBeNull();
  });
});
