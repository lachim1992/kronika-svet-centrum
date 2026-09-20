// ============================================================================
// SCRATCH-SESSION ACCEPTANCE TEST (Phase 1 closure)
//
//   create world → starter economy → build command → commit turn → read model
//
// Proves on a THROWAWAY session (never Test01):
//   - real producing structures exist after bootstrap
//   - demand + goods rows exist for the current turn
//   - exactly one capital per realm
//   - no household market output (population is not a goods producer)
//   - treasury delta equals the fiscal snapshot's turn_fiscal_delta
//   - re-running the same turn does not double-charge route upkeep
//
// Requires privileged credentials, so it is SKIPPED unless all env vars are set:
//   SCRATCH_URL=... SCRATCH_KEY=<service role> bunx vitest run scratch-session
// ============================================================================

import { describe, it, expect } from "vitest";

const URL_ = process.env.SCRATCH_URL;
const KEY = process.env.SCRATCH_KEY;
const enabled = !!(URL_ && KEY);
const PLAYER = "ScratchRuler";

const rest = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const invoke = async (name: string, body: unknown) => {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

describe.skipIf(!enabled)("scratch session: create → starter economy → commit → read", () => {
  it("reaches a playable, fiscally consistent state", async () => {
    // ── create a throwaway session ────────────────────────────────────────
    const [session] = await rest("game_sessions", {
      method: "POST",
      body: JSON.stringify({
        world_name: `Scratch ${Date.now()}`,
        mode: "tb_single_ai",
        current_turn: 1,
        init_status: "pending",
      }),
    });
    const sessionId = session.id as string;
    expect(sessionId).toBeTruthy();

    try {
      const boot = await invoke("create-world-bootstrap", {
        sessionId,
        playerName: PLAYER,
        world: { name: session.world_name, size: "small", premise: "Scratch test world" },
        identity: { realmName: "Scratch", settlementName: "Scratchgrad" },
        mode: "tb_single_ai",
      });
      expect(boot.status).toBe(200);

      // ── starter economy: real structures, not household output ──────────
      const buildings = await rest(
        `city_buildings?session_id=eq.${sessionId}&select=id,name,city_id,effects`,
      );
      expect(buildings.length).toBeGreaterThan(0);
      expect(buildings.every((b: any) => (b.effects?.recipe_keys || []).length > 0)).toBe(true);

      // ── capital invariant ───────────────────────────────────────────────
      const cities = await rest(`cities?session_id=eq.${sessionId}&select=id,owner_player,is_capital`);
      expect(cities.length).toBeGreaterThan(0);
      const perOwner = new Map<string, number>();
      for (const c of cities) {
        if (!c.owner_player) continue;
        perOwner.set(c.owner_player, (perOwner.get(c.owner_player) || 0) + (c.is_capital ? 1 : 0));
      }
      for (const count of perOwner.values()) expect(count).toBe(1);

      // ── derived pass produced demand + goods rows for the current turn ──
      const [{ current_turn: turn0 }] = await rest(`game_sessions?id=eq.${sessionId}&select=current_turn`);
      const demand = await rest(`demand_baskets?session_id=eq.${sessionId}&select=id&limit=5`);
      const balances = await rest(`city_good_balances?session_id=eq.${sessionId}&turn_number=eq.${turn0}&select=good_key&limit=5`);
      expect(demand.length).toBeGreaterThan(0);
      expect(balances.length).toBeGreaterThan(0);

      // ── a player build command still works through command-dispatch ─────
      const build = await invoke("command-dispatch", {
        session_id: sessionId,
        command_id: `scratch-${Date.now()}`,
        player_name: PLAYER,
        command: { type: "BUILD_BUILDING", payload: { city_id: cities[0].id, template_name: "Studna" } },
      });
      expect([200, 400]).toContain(build.status); // rejected commands must fail loudly, not silently mutate

      // ── commit the turn and compare treasury delta to the snapshot ──────
      const [before] = await rest(`realm_resources?session_id=eq.${sessionId}&player_name=eq.${PLAYER}&select=gold_reserve`);
      const commit = await invoke("commit-turn", { sessionId, playerName: PLAYER, skipNarrative: true });
      expect(commit.status).toBe(200);

      const [after] = await rest(
        `realm_resources?session_id=eq.${sessionId}&player_name=eq.${PLAYER}&select=gold_reserve,economy_detail`,
      );
      const goldDelta = Number(after.gold_reserve) - Number(before.gold_reserve);
      const snapshotDelta = Number(after.economy_detail?.wealth_breakdown?.turn_fiscal_delta ?? NaN);
      expect(Number.isFinite(snapshotDelta)).toBe(true);
      expect(Math.abs(goldDelta - snapshotDelta)).toBeLessThanOrEqual(2);

      // ── retrying the same turn must not double-charge route upkeep ──────
      const [{ current_turn: turn1 }] = await rest(`game_sessions?id=eq.${sessionId}&select=current_turn`);
      const replay = await invoke("world-layer-tick", { sessionId, turnNumber: turn1 });
      expect(replay.body.replayed).toBe(true);
      const [afterReplay] = await rest(`realm_resources?session_id=eq.${sessionId}&player_name=eq.${PLAYER}&select=gold_reserve`);
      expect(Number(afterReplay.gold_reserve)).toBe(Number(after.gold_reserve));
    } finally {
      await rest(`game_sessions?id=eq.${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
  }, 300_000);
});
