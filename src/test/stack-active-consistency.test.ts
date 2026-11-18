import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { actualSoldiers, computeWorkforceBreakdown } from "../../supabase/functions/_shared/manpower";
import { isFieldStack, isStackActive } from "../../supabase/functions/_shared/stackState";
import { applyStackMicroMove } from "../../supabase/functions/_shared/stackMovementCommand";

const src = (p: string) => readFileSync(p, "utf8");
const deployedButInactive = { is_active: false, is_deployed: true, soldiers: 1000 };

describe("is_active=false means an inactive unit everywhere", () => {
  it("an inactive but still deployed stack adds no soldiers", () => {
    expect(actualSoldiers([deployedButInactive, { is_active: true, soldiers: 101 }])).toBe(101);
  });
  it("an inactive deployed stack takes no workforce", () => {
    const cities = [{ population_peasants: 1000, population_burghers: 0, population_clerics: 0, population_warriors: 0 }];
    const wf = computeWorkforceBreakdown(cities, 0.3, 0, 0, actualSoldiers([deployedButInactive]));
    expect(wf.mobilized).toBe(0);
    expect(wf.workforce).toBe(wf.effectiveActivePop);
  });
  it("is_deployed alone never puts a unit in the field", () => {
    expect(isFieldStack(deployedButInactive)).toBe(false);
    expect(isFieldStack({ is_active: true, is_deployed: true })).toBe(true);
    expect(isStackActive(null)).toBe(false);
  });
  it("a disbanded army cannot move on the micro map", async () => {
    const stack = { id: "s", player_name: "Player", grid_x: 0, grid_y: 0, parcel_index: 0, moved_this_turn: false, is_active: false };
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: stack, error: null }) };
    const res = await applyStackMicroMove({ from: () => q }, { sessionId: "x", stackId: "s", actorName: "Player",
      microPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(res).toMatchObject({ ok: false, code: "STACK_INACTIVE" });
  });
  it("hex movement, node siege capture and economy upkeep all filter inactive stacks", () => {
    const move = src("supabase/functions/_shared/stackMovementCommand.ts");
    expect(move.match(/code: "STACK_INACTIVE"/g)?.length).toBe(2);
    expect(src("supabase/functions/_shared/turnProgress.ts")).toMatch(/if \(!isStackActive\(siegeStack\)\) continue;/);
    expect(src("supabase/functions/process-turn/index.ts")).toMatch(/from\("military_stacks"\)[\s\S]{0,300}\.eq\("is_active", true\)/);
  });
  it("disband trusts the stored stack, not the client-supplied manpower", () => {
    const cd = src("supabase/functions/command-dispatch/index.ts");
    const body = cd.slice(cd.indexOf("async function executeDisbandStack("), cd.indexOf("async function executeUpgradeFormation("));
    expect(body).not.toMatch(/payload\.returnedManpower|returnedManpower \|\| 0/);
    expect(body).toMatch(/is_active: false, is_deployed: false/);
    expect(body).toMatch(/readRealmWorkforce/);
  });
});
