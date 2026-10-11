import { describe, it, expect, vi } from "vitest";
import { buildSnapshot, residualOf, type LedgerBalance, type LedgerResult } from "../../supabase/functions/economy-dev-snapshot/build";

vi.stubGlobal("Deno", { env: { get: () => undefined } });
const { authorizeAdmin, parseRequest } = await import("../../supabase/functions/economy-dev-snapshot/auth");

const bal = (city: string, good: string, o: Partial<LedgerBalance> = {}): LedgerBalance => ({ city, good, opening: 0, produced_household: 0, produced_node: 0,
  produced_facility: 0, produced_district: 0, consumed_household: 0, consumed_state: 0, consumed_as_input: 0, imported: 0, exported: 0, stored: 0,
  lost_spoilage: 0, unmet_demand: 0, demand: 0, quality: 0, gross_output_value: 0, intermediate_value: 0, extraction_value: 0, capex: 0, ...o });

const fakeDb = (user: string | null, admin: boolean) => ({
  auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: user ? null : new Error("bad") }) },
  from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: admin ? [{ role: "admin" }] : [], error: null }) }) }) }),
});
const req = (token?: string) => new Request("http://x", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("economy-dev-snapshot auth", () => {
  it("rejects missing token with 401", async () => { await expect(authorizeAdmin(req(), fakeDb(null, false))).rejects.toMatchObject({ status: 401 }); });
  it("rejects invalid token with 401", async () => { await expect(authorizeAdmin(req("x"), fakeDb(null, false))).rejects.toMatchObject({ status: 401 }); });
  it("rejects authenticated non-admin with 403", async () => { await expect(authorizeAdmin(req("t"), fakeDb("u1", false))).rejects.toMatchObject({ status: 403 }); });
  it("accepts admin", async () => { await expect(authorizeAdmin(req("t"), fakeDb("u1", true))).resolves.toBe("u1"); });
  it("validates session id and turn", () => {
    expect(parseRequest({ sessionId: "nope" })).toBeNull();
    expect(parseRequest({ sessionId: "28712ebe-18cd-45a6-89c3-10e25b7da2f0", turn: 1.5 })).toBeNull();
    expect(parseRequest({ sessionId: "28712ebe-18cd-45a6-89c3-10e25b7da2f0", turn: 17 })).toEqual({ sessionId: "28712ebe-18cd-45a6-89c3-10e25b7da2f0", turn: 17 });
  });
});

describe("economy-dev-snapshot projection", () => {
  const cities = [{ id: "A", name: "A", owner: "R", cell: "0,0" }, { id: "B", name: "B", owner: "R", cell: "1,0" }];
  const base: LedgerResult = {
    balances: [bal("A", "flour", { produced_node: 10, exported: 4, stored: 6, demand: 0 }), bal("B", "flour", { imported: 4, consumed_as_input: 3, lost_spoilage: 1, demand: 3 }), bal("A", "salt")],
    flows: [{ good: "flour", source: "A", destination: "B", qty: 4, delivered: 3, quality: 0, gross_value: 6, transport_cost: 0.4, tolls: 0, net_value: 5.6, reason: "production_input",
      path: ["0,0", "1,0"], edges: ["e1"], via_hubs: [], famous: null, source_price: 1, destination_price: 2, expected_margin: 0 }],
    snapshot: { cities, edges: [{ id: "e1", from: "0,0", to: "1,0", capacity: 10 }], producers: [] },
  };
  it("keeps zero goods, reconciles world totals to rows and passes conservation", () => {
    const s = buildSnapshot(base, null);
    expect(s.goods.map((g) => g.good)).toEqual(["flour", "salt"]);
    expect(s.world.produced).toBe(10);
    expect(s.goods.reduce((a, g) => a + g.produced, 0)).toBe(s.world.produced);
    expect(s.anomalies.filter((a) => a.check === "conservation_mismatch")).toHaveLength(0);
    expect(s.flows[0].landed_unit_cost).toBeCloseTo((4 * 1 + 0.4) / 3);
  });
  it("flags a conservation break", () => {
    expect(residualOf(bal("A", "x", { produced_node: 5, stored: 4 }))).toBe(1);
    const s = buildSnapshot({ ...base, balances: [bal("A", "x", { produced_node: 5, stored: 4 })] }, null);
    expect(s.anomalies.some((a) => a.check === "conservation_mismatch" && a.severity === "broken")).toBe(true);
  });
  it("flags flow beyond edge capacity and fame without origin", () => {
    const s = buildSnapshot({ ...base, snapshot: { ...base.snapshot, edges: [{ id: "e1", from: "0,0", to: "1,0", capacity: 2 }] },
      productChoice: [{ city: "B", good: "flour", fame: 1.3, fame_origin: null }] }, null);
    expect(s.anomalies.some((a) => a.check === "flow_beyond_capacity")).toBe(true);
    expect(s.anomalies.some((a) => a.check === "fame_without_origin")).toBe(true);
  });
  it("flags production with a planned-unavailable input", () => {
    const s = buildSnapshot({ ...base, snapshot: { ...base.snapshot, producers: [{ id: "n:bake", city: "B", node: "n", channel: "node", source: false, capacity: 5,
      recipe: { key: "bake", good: "bread", qty: 1, inputs: [{ good: "flour", qty: 1 }] }, expectedInputSources: { flour: { cost: Infinity, source: "unavailable", available: false } } }] },
      diagnostics: [{ producer: "n:bake", good: "bread", capacity: 5, realized: 2, factors: {}, blocked: null, inputs: [{ good: "flour", required: 2, supplied: 2 }] }] }, null);
    expect(s.anomalies.some((a) => a.check === "auto_unavailable_input_produced")).toBe(true);
  });
});
