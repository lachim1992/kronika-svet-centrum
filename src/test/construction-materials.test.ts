import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { accrueComposition, allocateConstruction, constructionPointsByMaterial, materialRequirement, normalizeComposition,
  quoteConstruction, scaleAccrual } from '../../supabase/functions/_shared/constructionMaterials';

const sum = (c: Record<string, number>) => Object.values(c).reduce((s, x) => s + x, 0);

describe('construction material sub-ledger (one spending channel)', () => {
  it('points by material equal the pooled capex points', () => {
    const bs = [{ good: 'lumber', construction_points: 10 }, { good: 'raw_timber', construction_points: 2 },
      { good: 'stone_blocks', construction_points: 6 }, { good: 'construction_materials', construction_points: 4 }, { good: 'grain', construction_points: 0 }];
    const c = constructionPointsByMaterial(bs);
    expect(c).toEqual({ wood: 12, stone: 6, mixed: 4, unattributed: 0 });
    expect(sum(c)).toBe(22);
  });
  it('legacy realm: whole reserve is unattributed; composition always sums to the reserve', () => {
    expect(normalizeComposition({}, 50)).toEqual({ wood: 0, stone: 0, mixed: 0, unattributed: 50 });
    const shrunk = normalizeComposition({ wood: 40, stone: 40, mixed: 0, unattributed: 20 }, 50); // a road spent 50
    expect(shrunk.wood).toBe(20); expect(shrunk.stone).toBe(20);
    expect(sum(shrunk)).toBeCloseTo(50, 6);
  });
  it('accrual adds exactly the accrued points, attributed by material', () => {
    const next = accrueComposition({ wood: 5, stone: 0, mixed: 0, unattributed: 5 }, 10, scaleAccrual({ wood: 3, stone: 1 }, 8), 18);
    expect(next).toEqual({ wood: 11, stone: 2, mixed: 0, unattributed: 5 });
    expect(sum(next)).toBe(18);
  });
  it('requirement split keeps the server price total exactly', () => {
    const r = materialRequirement({ cost_wood: 10, cost_stone: 10, cost_iron: 5 }, 23); // marble discount 25 → 23
    expect(r.wood + r.stone + r.iron).toBe(23);
    expect(materialRequirement({ cost_wood: 30 }, 30)).toEqual({ wood: 30, stone: 0, iron: 0, total: 30 });
  });
  it('wood need cannot be paid by stone-origin reserve', () => {
    const comp = { wood: 5, stone: 100, mixed: 0, unattributed: 0 };
    const a = allocateConstruction(comp, { wood: 20, stone: 0, iron: 0, total: 20 });
    expect(a.ok).toBe(false);
    expect(a.shortage.wood).toBe(15);
    expect(a.next).toEqual(comp); // nothing drawn on refusal
  });
  it('allocation draws exactly the total once (no double spend) and conserves the remainder', () => {
    const comp = { wood: 20, stone: 10, mixed: 5, unattributed: 5 };
    const req = { wood: 22, stone: 10, iron: 3, total: 35 };
    const a = allocateConstruction(comp, req);
    expect(a.ok).toBe(true);
    const drawn = Object.values(a.draws).reduce((s, d) => s + sum(d as any), 0);
    expect(drawn).toBe(35);
    expect(sum(a.next)).toBe(sum(comp) - 35);
    expect(a.draws.wood).toEqual({ wood: 20, mixed: 2 });
    expect(a.draws.iron).toEqual({ unattributed: 3 });
  });
  it('quote marks iron as pooled points, never a physical iron draw', () => {
    const q = quoteConstruction({ wood: 10 }, 10, { wood: 5, stone: 0, iron: 5, total: 10 });
    expect(q.ok).toBe(true);
    expect(q.lines.find(l => l.material === 'iron')!.physical).toBe(false);
    expect(quoteConstruction({ wood: 10 }, 10, { wood: 0, stone: 5, iron: 0, total: 5 }).lines[1].status).toBe('shortage');
  });
  it('BUILD_BUILDING has one spending path: SQL allocation, legacy charge only when the function is missing', () => {
    const src = readFileSync('supabase/functions/command-dispatch/index.ts', 'utf8');
    const block = src.slice(src.indexOf('async function executeBuildBuilding'), src.indexOf('async function executeUpgradeBuilding'));
    expect(block).toContain('allocate_construction_reserve');
    expect(block).toMatch(/isMissingRpc\(allocErr\)\)\s*\{\s*materialAllocation = "legacy_pooled";\s*const charge = await chargeReserves/);
    expect((block.match(/chargeReserves\(/g) || []).length).toBe(1);
    expect(block).not.toMatch(/city_good_balances|node_inventory/); // never a second draw from city stock
    expect(block).toContain('physical_stock_drawn: false');
  });
  it('SQL allocation is atomic, turn-checked and idempotent by command', () => {
    const sql = readFileSync('supabase/migrations/20261123100000_construction_material_allocations.sql', 'utf8');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('UNIQUE (session_id, command_id)');
    expect(sql).toMatch(/cur <> p_turn/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.allocate_construction_reserve[^;]*TO service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.allocate_construction_reserve[^;]*authenticated/);
  });
  it('process-turn attributes the same accrual it books (no extra reserve)', () => {
    const src = readFileSync('supabase/functions/process-turn/index.ts', 'utf8');
    expect(src).toMatch(/scaleAccrual\([^)]*construction_by_material, productionIncome\)/);
  });
});
