import { describe, it, expect } from "vitest";
import { validateAdminOp } from "../../supabase/functions/admin-dev-write/policy";

const S = "28712ebe-18cd-45a6-89c3-10e25b7da2f0";
const U = "b6bbf6d8-b597-476d-8ed8-c8ccf1fb3186";

describe("admin-dev-write policy", () => {
  it("never allows current_turn writes", () => {
    const r = validateAdminOp({ sessionId: S, table: "game_sessions", action: "update", values: { current_turn: 99 } }, U);
    expect(r.ok).toBe(false);
  });
  it("never allows victory fields", () => {
    const r = validateAdminOp({ sessionId: S, table: "game_sessions", action: "update", values: { victory_winner: "x" } }, U);
    expect(r.ok).toBe(false);
  });
  it("rejects tables outside the allowlist", () => {
    expect(validateAdminOp({ sessionId: S, table: "turn_phase_journal", action: "delete" }, U).ok).toBe(false);
  });
  it("forces session scope on updates", () => {
    const r = validateAdminOp({ sessionId: S, table: "realm_resources", action: "update", values: { gold_reserve: 1 }, filters: [{ op: "eq", column: "id", value: "a" }] }, U);
    expect(r.ok && r.op.filters).toContainEqual({ op: "eq", column: "session_id", value: S });
  });
  it("allows audited building changes only inside the requested session", () => {
    const r = validateAdminOp({ sessionId: S, table: "city_buildings", action: "update", values: { current_level: 2 }, filters: [{ op: "eq", column: "id", value: "a" }] }, U);
    expect(r.ok).toBe(true);
    expect(r.ok && r.op.filters).toContainEqual({ op: "eq", column: "session_id", value: S });
  });
  it.each(["road_segments", "tile_parcels"])("pins %s scenario edits to the requested session", (table) => {
    const r = validateAdminOp({ sessionId: S, table, action: "update", values: { status: "claimed" }, filters: [] }, U);
    expect(r.ok).toBe(true);
    expect(r.ok && r.op.filters).toContainEqual({ op: "eq", column: "session_id", value: S });
  });
  it("rejects rows targeting another session", () => {
    const r = validateAdminOp({ sessionId: S, table: "cities", action: "insert", values: { session_id: "00000000-0000-0000-0000-000000000000", name: "x" } }, U);
    expect(r.ok).toBe(false);
  });
  it("rejects a cross-session scope filter", () => {
    const r = validateAdminOp({ sessionId: S, table: "cities", action: "delete", filters: [{ op: "eq", column: "session_id", value: "00000000-0000-0000-0000-000000000000" }] }, U);
    expect(r.ok).toBe(false);
  });
  it("game_sessions update is pinned to the request session id", () => {
    const r = validateAdminOp({ sessionId: S, table: "game_sessions", action: "update", values: { world_seed: "s" } }, U);
    expect(r.ok && r.op.filters).toContainEqual({ op: "eq", column: "id", value: S });
  });
});

describe("admin-dev-write composition insert", () => {
  const S2 = "28712ebe-18cd-45a6-89c3-10e25b7da2f0", U2 = "b6bbf6d8-b597-476d-8ed8-c8ccf1fb3186";
  it("allows inserting units with a stack id", () => {
    expect(validateAdminOp({ sessionId: S2, table: "military_stack_composition", action: "insert", values: [{ stack_id: S2, unit_type: "MILITIA", manpower: 200 }] }, U2).ok).toBe(true);
  });
  it("rejects unit inserts without a stack id", () => {
    expect(validateAdminOp({ sessionId: S2, table: "military_stack_composition", action: "insert", values: { unit_type: "MILITIA", manpower: 200 } }, U2).ok).toBe(false);
  });
});
