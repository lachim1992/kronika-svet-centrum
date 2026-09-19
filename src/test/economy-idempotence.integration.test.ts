// ============================================================================
// REAL integration idempotence test (Integrity Pass closure, P1).
//
// Unlike economy-integrity.test.ts (static contract assertions over source
// code), this test actually hits the deployed backend:
//
//   refresh-economy → state hash S1 → refresh-economy → state hash S2
//   assert  S1 === S2                        (derived idempotence)
//   assert  fiscal columns unchanged         (FISCAL GUARD)
//   assert  node_economy_history count same  (HISTORY GUARD)
//
// It requires privileged credentials, so it is SKIPPED unless both env vars are
// present. Run locally / in CI with:
//
//   ECONOMY_IT_URL=... ECONOMY_IT_KEY=<service role> \
//   ECONOMY_IT_SESSION=<session uuid> bunx vitest run economy-idempotence
// ============================================================================

import { describe, it, expect } from "vitest";

const URL_ = process.env.ECONOMY_IT_URL;
const KEY = process.env.ECONOMY_IT_KEY;
const SESSION = process.env.ECONOMY_IT_SESSION;
const enabled = !!(URL_ && KEY && SESSION);

const rest = async (path: string) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}`);
  return res.json();
};

const refresh = async () => {
  const res = await fetch(`${URL_}/functions/v1/refresh-economy`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION }),
  });
  return { status: res.status, body: await res.json() };
};

const NODE_COLS = "id,production_output,wealth_output,capacity_score,importance_score";
const FISCAL_COLS = "player_name,gold_reserve,grain_reserve,production_reserve,manpower_pool,legitimacy,wealth_pop_tax,wealth_domestic_market,goods_wealth_fiscal";

const stable = (rows: any[], key: string) =>
  JSON.stringify(rows.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key]))));

const snapshot = async () => {
  const [nodes, fiscal, history] = await Promise.all([
    rest(`province_nodes?session_id=eq.${SESSION}&select=${NODE_COLS}`),
    rest(`realm_resources?session_id=eq.${SESSION}&select=${FISCAL_COLS}`),
    rest(`node_economy_history?session_id=eq.${SESSION}&select=id`),
  ]);
  return {
    derived: stable(nodes, "id"),
    fiscal: stable(fiscal, "player_name"),
    historyCount: (history as any[]).length,
  };
};

describe.skipIf(!enabled)("economy idempotence (live backend)", () => {
  it("refresh ×2 leaves derived state, fiscal state and history identical", async () => {
    const before = await snapshot();
    const r1 = await refresh();
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);
    expect(r1.body.fiscal_unchanged).toBe(true);
    const s1 = await snapshot();
    expect(s1.fiscal).toBe(before.fiscal);
    expect(s1.historyCount).toBe(before.historyCount);

    const r2 = await refresh();
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    expect(r2.body.fiscal_unchanged).toBe(true);
    const s2 = await snapshot();

    // DERIVED IDEMPOTENCE
    expect(s2.derived).toBe(s1.derived);
    // FISCAL GUARD
    expect(s2.fiscal).toBe(s1.fiscal);
    // HISTORY GUARD — refresh must never append history rows
    expect(s2.historyCount).toBe(s1.historyCount);
  }, 180_000);

  it("refresh never reports a fiscal guard violation", async () => {
    const { body } = await refresh();
    const warnings: string[] = body.warnings || [];
    expect(warnings.some((w) => w.includes("fiscal_guard_violation"))).toBe(false);
  }, 120_000);
});

describe.skipIf(enabled)("economy idempotence (skipped)", () => {
  it("documents how to enable the live test", () => {
    expect(enabled).toBe(false);
  });
});
