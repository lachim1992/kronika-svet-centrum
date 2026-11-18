import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const handler = read("supabase/functions/command-dispatch/fieldBattleCommand.ts");
const dispatch = read("supabase/functions/command-dispatch/index.ts");
const migration = read("drizzle/migrations/0035_general_command_atomic_field_settlement.sql");

describe("field-battle persistence boundary", () => {
  it("stores canonical meta at creation, every CAS update and final settlement", () => {
    expect(handler).toContain("attacker_stack_id: st.id, defender_stack_id: en.id, started_turn: turnNumber, battlefield: field, units, ready, meta");
    expect(handler).toContain("update({ ...patch, meta: patch.meta ?? meta, rev: fb.rev + 1 })");
    expect(handler).toContain("meta.aiPlan = { ...(meta.aiPlan ?? {}), [s]: planned.plan }");
    expect(handler).toContain("meta: r.meta, last_report: report");
    expect(handler).toContain("last_report: summary, meta: r.meta");
    expect(handler).not.toContain("last_report?.meta");
  });

  it("has only the atomic RPC settlement path and no direct partial army writes", () => {
    expect(handler).toContain('rpc("settle_field_battle"');
    expect(handler).not.toContain('.from("military_stacks").update');
    expect(handler).not.toContain('.from("military_stack_composition").update');
    expect(migration).toContain("Settlement stack set does not match battle");
    expect(migration).toContain("Settlement contains foreign composition rows");
    expect(migration).toContain("Settlement composition totals do not match soldiers");
  });

  it("loads real quality and fails clearly on inconsistent composition sums", () => {
    expect(handler.match(/select\("id, stack_id, unit_type, manpower, quality"\)/g)).toHaveLength(2);
    expect(handler.match(/Invalid army composition:/g)).toHaveLength(2);
  });
});

describe("general assignment security boundary", () => {
  it("uses one atomic server RPC rather than client-trusted assignment updates", () => {
    expect(dispatch).toContain('rpc("assign_general_to_stack"');
    expect(migration).toContain("WHERE id = p_general AND session_id = p_session AND player_name = p_actor FOR UPDATE");
    expect(migration).toContain("WHERE id = p_stack AND session_id = p_session AND player_name = p_actor FOR UPDATE");
    expect(migration).toContain("CREATE UNIQUE INDEX military_stacks_general_id_unique");
    expect(migration).toContain("LEAST(12000, 2000 + ROUND(GREATEST(0, LEAST(100, g.skill)) * 100)::integer)");
  });

  it("enforces capacity during recruitment, reinforcement and assignment", () => {
    expect(dispatch).toContain("capacity = generalArmyCapacity(selectedGeneral?.skill ?? null)");
    expect(dispatch).toContain("capacity = generalArmyCapacity(generalSkill)");
    expect(migration).toContain("target.soldiers > capacity");
  });
});
