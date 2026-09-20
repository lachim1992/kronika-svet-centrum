import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(root(p), "utf8");

const COMMIT = read("supabase/functions/commit-turn/index.ts");

/**
 * Phase 4 — legacy removal.
 * The persistent real-time mode is abandoned: there is exactly one game loop
 * (commit-turn). The turn-based parts of the old tick were extracted, not lost.
 */
describe("phase 4: the second game loop is gone", () => {
  for (const fn of ["world-tick", "process-tick"]) {
    it(`${fn} edge function is removed`, () => {
      expect(existsSync(root(`supabase/functions/${fn}/index.ts`))).toBe(false);
    });
  }

  it("nothing invokes the removed functions", () => {
    for (const f of [
      "supabase/functions/commit-turn/index.ts",
      "supabase/functions/process-turn/index.ts",
      "src/lib/ai.ts",
    ]) {
      expect(read(f)).not.toMatch(/invoke\("(world|process)-tick"/);
    }
  });

  it("config.toml no longer configures them", () => {
    const cfg = read("supabase/config.toml");
    expect(cfg).not.toContain("[functions.world-tick]");
    expect(cfg).not.toContain("[functions.process-tick]");
  });

  it("time-based UI surfaces are removed", () => {
    for (const f of [
      "src/pages/game/PersistentTab.tsx",
      "src/components/ActionQueuePanel.tsx",
      "src/components/TimePoolPanel.tsx",
    ]) {
      expect(existsSync(root(f))).toBe(false);
    }
    expect(read("src/pages/Dashboard.tsx")).not.toContain("PersistentTab");
  });

  it("dead player screens are removed", () => {
    expect(existsSync(root("src/pages/game/CitiesTab.tsx"))).toBe(false);
    expect(existsSync(root("src/components/EmpireManagement.tsx"))).toBe(false);
  });
});

describe("phase 4: turn-based tick logic was extracted, not dropped", () => {
  it("commit-turn advances army travel, ambush, sieges and node projects once", () => {
    expect(COMMIT).toContain('import { advanceTurnProgress } from "../_shared/turnProgress.ts"');
    expect(COMMIT).toMatch(/advanceTurnProgress\(supabase, sessionId, turnNumber\)/);
    expect(COMMIT.match(/advanceTurnProgress\(/g)?.length).toBe(2); // import + single call
  });

  it("the extracted module keeps physical ownership only", () => {
    const src = read("supabase/functions/_shared/turnProgress.ts");
    expect(src).toMatch(/military_stacks/);
    expect(src).toMatch(/node_projects/);
    expect(src).not.toMatch(/gold_reserve/);
    expect(src).not.toMatch(/population_total/);
    // time-clock-only concerns must not come back
    expect(src).not.toMatch(/time_pools|action_queue|travel_orders|is_delegated/);
  });
});

describe("phase 4: legacy node wealth is not player-facing", () => {
  it("the map no longer prints wealth_output as 'bohatství'", () => {
    const src = read("src/components/map/IsometricSquareMap.tsx");
    expect(src).not.toMatch(/bohatství \{citySubnodes\.wealth\}/);
    expect(src).not.toMatch(/wealth: Math\.round\(list\.reduce/);
  });
});
