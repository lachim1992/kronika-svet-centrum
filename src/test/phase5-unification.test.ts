import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { derivedChainSteps } from "../../supabase/functions/_shared/derivedChain.ts";

const root = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(root(p), "utf8");

const COMMIT = read("supabase/functions/commit-turn/index.ts");
const REFRESH = read("supabase/functions/refresh-economy/index.ts");

/**
 * Phase 5 — one derived chain, one road model.
 */
describe("phase 5: one derived chain definition", () => {
  const CANONICAL = [
    "compute-province-routes",
    "compute-hex-flows",
    "compute-trade-systems",
    "compute-trade-flows",
    "compute-basket-trade-flows",
    "compute-economy-flow",
  ];

  it("both callers build their steps from the shared module", () => {
    expect(COMMIT).toContain('from "../_shared/derivedChain.ts"');
    expect(REFRESH).toContain('from "../_shared/derivedChain.ts"');
    expect(COMMIT).toMatch(/derivedChainSteps\(\{/);
    expect(REFRESH).toMatch(/derivedChainSteps\(\{/);
  });

  it("neither caller hardcodes its own step list any more", () => {
    // commit-turn keeps ONE extra targeted compute-hex-flows call in phase 5b:
    // node projects finished later in the turn mark routes dirty, so paths are
    // refreshed before the collapse check. That is not a second chain.
    for (const src of [COMMIT, REFRESH]) {
      for (const step of CANONICAL) {
        if (src === COMMIT && step === "compute-hex-flows") continue;
        expect(src, step).not.toContain(`invoke("${step}"`);
      }
    }
    expect(COMMIT.match(/invoke\("compute-hex-flows"/g) || []).toHaveLength(1);
  });

  it("keeps the canonical order and ends in aggregation", () => {
    const steps = derivedChainSteps({ sessionId: "s" });
    expect(steps.map((s) => s.fn)).toEqual([...CANONICAL, "aggregate-realm-totals"]);
  });

  it("emits trade-system events only when the caller asks (turn resolution)", () => {
    const refresh = derivedChainSteps({ sessionId: "s" });
    const turn = derivedChainSteps({ sessionId: "s", emitEvents: true });
    expect(refresh.find((s) => s.fn === "compute-trade-systems")!.body).not.toHaveProperty("emit_events");
    expect(turn.find((s) => s.fn === "compute-trade-systems")!.body).toHaveProperty("emit_events", true);
  });

  it("commit-turn projects goods onto the new turn; refresh uses the current one", () => {
    const turn = derivedChainSteps({ sessionId: "s", goodsTurn: 65 });
    expect(turn.find((s) => s.fn === "compute-trade-flows")!.body).toHaveProperty("turn_number", 65);
    const refresh = derivedChainSteps({ sessionId: "s" });
    expect(refresh.find((s) => s.fn === "compute-trade-flows")!.body).not.toHaveProperty("turn_number");
  });

  it("aggregation phase is explicit for turn resolution", () => {
    const physical = derivedChainSteps({ sessionId: "s", aggregatePhase: "physical" });
    const last = physical[physical.length - 1];
    expect(last.body).toHaveProperty("phase", "physical");
    expect(COMMIT).toMatch(/aggregatePhase:\s*"physical"/);
  });

  it("the shared chain never carries fiscal or history payloads", () => {
    const src = read("supabase/functions/_shared/derivedChain.ts");
    expect(src).not.toMatch(/gold_reserve|_history|snapshot/);
  });

  it("commit-turn anchors city settlement nodes with the same helper as refresh", () => {
    expect(COMMIT).toContain("ensureCitySettlementNodes(supabase, sessionId)");
    expect(REFRESH).toContain("ensureCitySettlementNodes(sb, session_id)");
  });
});

describe("phase 5: one player-facing road model", () => {
  it("the duplicate province_routes build UI is removed", () => {
    for (const f of [
      "src/components/map/WorldMapBuildPanel.tsx",
      "src/components/map/RouteDetailSheet.tsx",
      "src/components/map/RoadNetworkOverlay.tsx",
    ]) {
      expect(existsSync(root(f))).toBe(false);
    }
    const tab = read("src/pages/game/WorldMapTab.tsx");
    expect(tab).not.toContain("WorldMapBuildPanel");
    expect(tab).not.toContain("RouteDetailSheet");
  });

  it("the player map reads the physical road layer", () => {
    const map = read("src/components/map/IsometricSquareMap.tsx");
    expect(map).toMatch(/from\("road_segments"\)/);
    expect(map).toMatch(/from\("road_projects"\)/);
  });

  it("no panel starts an abstract route build any more", () => {
    const panel = read("src/components/NeutralNodePanel.tsx");
    expect(panel).not.toContain("emitFocusBuild");
  });
});
