import { describe, it, expect } from 'vitest';
import { canonicalBuilding } from '../../supabase/functions/_shared/buildValidation';

// Mirrors command-dispatch BUILD charge: production = wood + stone + iron, gold = cost_wealth.
const charge = (t: any) => { const b = canonicalBuilding(t); return { prod: b.cost_wood + b.cost_stone + b.cost_iron, gold: b.cost_wealth }; };

describe('JV72O7 turn-1→2 reserve audit (live numbers, Nov 11 2026)', () => {
  it('Player: Tkalcovna 20+10+5 explains 50 → 15 + committed raw capex 0.038', () => {
    const c = charge({ id: 't', name: 'Tkalcovna', cost_wood: 20, cost_stone: 10, cost_iron: 5, cost_wealth: 20 });
    expect(c.prod).toBe(35);
    expect(50 - c.prod + 0.038181710712282255).toBeCloseTo(15.038181710712282, 9);
    expect(100 - c.gold).toBe(80); // live 81 = 80 + one turn net fiscal +1
  });
  it('AI1: Kasárny 25+15+10 consumes the whole 50 reserve', () => {
    const c = charge({ id: 'k', name: 'Kasárny', cost_wood: 25, cost_stone: 15, cost_iron: 10, cost_wealth: 20 });
    expect(c.prod).toBe(50);
    expect(50 - c.prod + 0.04102154934520205).toBeCloseTo(0.041021549345, 9);
  });
});
