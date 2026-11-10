import { describe, it, expect } from 'vitest';
import { fixture, run, conserve } from './industrial-input-trade.fixture';

const grainInput = (p: any) => p.result.industrialInputs.find((x: any) => x.producer === 'mill:mill_grain' && x.good === 'raw_grain');
const withFriction = async (f: number) => { const t = fixture('lock', 100, 80); t.road_segments[0].friction = f; return run(t); };

describe('production_input refusal reasons stay distinct (no conflated landed_cost_cap)', () => {
  it('cheap haul: grain imported, no refusal, conserved', async () => {
    const p = await withFriction(0.1); conserve(p);
    expect(grainInput(p).imported).toBeGreaterThan(0);
    expect(grainInput(p).blocked).toBeNull();
  });
  it('freight above delivered value: haul_exceeds_value, not landed_cost_cap; nothing shipped; conserved', async () => {
    const p = await withFriction(12); conserve(p);
    expect(grainInput(p).imported).toBe(0);
    expect(grainInput(p).blocked).toBe('haul_exceeds_value');
    expect(p.result.flows.some((f: any) => f.good === 'raw_grain' && f.destination === 'b' && f.reason === 'production_input')).toBe(false);
  });
  it('deterministic rerun', async () => {
    const a = await withFriction(12), b = await withFriction(12);
    expect(JSON.stringify(a.result.industrialInputs)).toBe(JSON.stringify(b.result.industrialInputs));
  });
});
