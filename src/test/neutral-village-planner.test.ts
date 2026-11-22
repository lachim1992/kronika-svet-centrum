import { describe, it, expect } from 'vitest';
import { planNeutralVillage, deterministicCommandId, isFootpathCell, NEUTRAL_VILLAGE_GOLD_BUFFER } from '../../supabase/functions/_shared/neutralVillagePlanner';
import { RURAL_SETTLEMENT_COST, RURAL_SETTLEMENT_UPGRADE_COST } from '../../supabase/functions/_shared/ruralSettlement';
import { readFileSync } from 'node:fs';

const city = { id: 'c1', name: 'Ovčín', owner_player: 'Neutral:sheep', status: 'ok', grid_x: 5, grid_y: 5 };
const parcel = (id: string, x: number, y: number, extra: any = {}) => ({ id, grid_x: x, grid_y: y, parcel_index: 0, city_id: 'c1', owner_player: 'Neutral:sheep', claim_kind: 'worked', ...extra });
const base = { sessionId: 's', closedTurn: 4, city, gold: 1000, parcels: [parcel('p1', 6, 5)], villages: [] as any[], roads: [] as any[] };

describe('neutral village planner', () => {
  it('founds on an own worked footpath parcel at the server price', () => {
    const a = planNeutralVillage(base)!;
    expect(a.kind).toBe('create');
    expect(a.cost).toBe(RURAL_SETTLEMENT_COST);
    expect((a as any).parcelId).toBe('p1');
  });
  it('never acts for player cities, foreign or non-worked parcels, or cells with a road', () => {
    expect(planNeutralVillage({ ...base, city: { ...city, owner_player: 'Player' } })).toBeNull();
    expect(planNeutralVillage({ ...base, parcels: [parcel('p1', 6, 5, { owner_player: 'Player' })] })).toBeNull();
    expect(planNeutralVillage({ ...base, parcels: [parcel('p1', 6, 5, { claim_kind: 'urban' })] })).toBeNull();
    expect(planNeutralVillage({ ...base, roads: [{ from_x: 5, from_y: 5, to_x: 6, to_y: 5, status: 'completed' }] })).toBeNull();
    expect(planNeutralVillage({ ...base, parcels: [parcel('p1', 7, 5)] })).toBeNull(); // no_road stays blocked, village useless
  });
  it('no action without gold for price + buffer (no free villages)', () => {
    expect(planNeutralVillage({ ...base, gold: RURAL_SETTLEMENT_COST + NEUTRAL_VILLAGE_GOLD_BUFFER - 1 })).toBeNull();
    expect(planNeutralVillage({ ...base, gold: RURAL_SETTLEMENT_COST + NEUTRAL_VILLAGE_GOLD_BUFFER })).not.toBeNull();
  });
  it('upgrades its own footpath village one level at a time, stops at 3', () => {
    const v = { id: 'v1', city_id: 'c1', owner_player: 'Neutral:sheep', grid_x: 6, grid_y: 5, level: 1 };
    const a = planNeutralVillage({ ...base, villages: [v] })!;
    expect(a).toMatchObject({ kind: 'upgrade', targetLevel: 2, cost: RURAL_SETTLEMENT_UPGRADE_COST[2] });
    expect(planNeutralVillage({ ...base, villages: [{ ...v, level: 3 }], parcels: [] })).toBeNull();
    expect(planNeutralVillage({ ...base, villages: [{ ...v, level: 2 }], gold: RURAL_SETTLEMENT_UPGRADE_COST[3] + NEUTRAL_VILLAGE_GOLD_BUFFER - 1 })).toBeNull();
  });
  it('one village per macro cell, even another owner', () => {
    expect(planNeutralVillage({ ...base, villages: [{ id: 'x', city_id: 'z', owner_player: 'Player', grid_x: 6, grid_y: 5, level: 1 }] })).toBeNull();
  });
  it('command ids are deterministic per turn/city/parcel (retry = same id, no double debit)', () => {
    expect((planNeutralVillage(base) as any).commandId).toBe((planNeutralVillage(base) as any).commandId);
    expect((planNeutralVillage({ ...base, closedTurn: 5 }) as any).commandId).not.toBe((planNeutralVillage(base) as any).commandId);
    expect(deterministicCommandId('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('footpath = 4-neighbour of the seat without a completed road', () => {
    expect(isFootpathCell(city, 6, 6, [])).toBe(false);
    expect(isFootpathCell(city, 5, 4, [{ from_x: 5, from_y: 4, to_x: 5, to_y: 5, status: 'building' }])).toBe(true);
  });
  it('edge function keeps the shared 2-action cap and uses the player commands only', () => {
    const src = readFileSync('supabase/functions/neutral-city-investments/index.ts', 'utf8');
    const block = src.slice(src.indexOf('planNeutralVillage({'));
    expect(src).toMatch(/if\(actions<2\) \{\s*const \[citiesRes/);
    expect(block).toContain('CREATE_RURAL_SETTLEMENT');
    expect(src).not.toMatch(/rural_settlements"\)\.(insert|update)/);
    expect(src).not.toMatch(/realm_resources"\)\.update/);
  });
});
