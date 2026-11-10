// @vitest-environment node
import { it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { AUDIT_ITEMS, HEX_NODE_AUDIT_VERSION, AUDIT_STATUSES } from '../lib/hexNodeAudit';
it('reviewed features have existing authoritative evidence, valid status and version', () => {
  expect(HEX_NODE_AUDIT_VERSION).toBe('2026-11-10.2');
  for (const item of AUDIT_ITEMS) {
    expect(AUDIT_STATUSES).toContain(item.status);
    expect(existsSync(item.serverFile), item.feature).toBe(true);
    if (item.clientFile !== '—') expect(existsSync(item.clientFile), item.feature).toBe(true);
  }
});
it('existing canonical solver/demand/trade cannot regress to obsolete missing claims', () => {
  for (const feature of ['Goods production chain (source→processing→urban→guild)', 'Demand basket computation', 'Trade pressure engine', 'Node capability tags', 'Quality inheritance (variants)'])
    expect(AUDIT_ITEMS.find(i => i.feature === feature)?.status).toBe('implemented');
  expect(readFileSync('supabase/functions/compute-trade-flows/index.ts', 'utf8')).toContain('computeCanonicalEconomy');
  expect(readFileSync('supabase/functions/_shared/economyAdapter.ts', 'utf8')).toContain('resolveGoodsEconomy');
});
it('guild writer is behind fiscal buffering; refresh has no specialization accrual', () => {
  const turn = readFileSync('supabase/functions/process-turn/index.ts', 'utf8');
  expect(turn.indexOf('const fiscalPlan = planFiscalWrites')).toBeLessThan(turn.indexOf('const next = accrueGuildSpecialization'));
  expect(turn).toContain('p_writes: fiscalPlan.writes');
  expect(readFileSync('supabase/functions/refresh-economy/index.ts', 'utf8')).not.toContain('accrueGuildSpecialization');
});