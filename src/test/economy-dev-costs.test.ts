import { describe, it, expect } from "vitest";
import { buildCosts, buildSpecific, compareCosts, type CostInputProducer, type CostInputDiag } from "../../supabase/functions/economy-dev-snapshot/costs";
import { buildSnapshot, SCHEMA_VERSION } from "../../supabase/functions/economy-dev-snapshot/build";

const owners = new Map([["A", "R1"], ["B", "R2"], ["C", "R1"]]);
const mill = (id: string, city: string): CostInputProducer => ({ id, city, node: "n" + id, channel: "facility",
  recipe: { key: "mill", good: "flour", qty: 2, inputs: [{ good: "grain", qty: 4 }] }, capacity: 10,
  expectedInputSources: { grain: { cost: 1.5, source: "C", available: true } } });
const parts = { source: 1, transport: 0.3, tolls: 0.1, tariff: 0, risk: 0.05, loss_cost: 0.05 }; // landed 1.5

const diags: CostInputDiag[] = [
  // A: 5 flour from 10 grain, all local @ 1.0 → material 2.0/ks
  { producer: "pa", realized: 5, potential_output: 5, blocked: null, margin: { cost: 10, revenue: 15, margin: 5, unit_output_price: 3, diagnostic_version: 2,
    inputs: [{ good: "grain", qty: 10, price: 1, local_price: 1, imported_qty: 0, landed_unit_cost: null, chosen_supplier: null, cheaper_supplier: null, landed_parts: null }] } },
  // B: 5 flour from 10 grain, 4 imported from C @ landed 1.5 (v2 parts), 6 local @ 1.2 → (6+7.2)/5 = 2.64
  { producer: "pb", realized: 5, potential_output: 5, blocked: null, margin: { cost: 13.2, revenue: 15, margin: 1.8, unit_output_price: 3, diagnostic_version: 2,
    inputs: [{ good: "grain", qty: 10, price: 1.32, local_price: 1.2, imported_qty: 4, landed_unit_cost: 1.5, chosen_supplier: "C", cheaper_supplier: null, landed_parts: parts }] } },
  // C: produced nothing — planned estimate only
  { producer: "pc", realized: 0, potential_output: 5, blocked: "missing_inputs" },
];

const rows = buildCosts({ producers: [mill("pa", "A"), mill("pb", "B"), mill("pc", "C")], diagnostics: diags, prices: [], famous: [], owners });
const by = (id: string) => rows.find((r) => r.producer === id)!;

describe("economy dev costs (read-only projection)", () => {
  it("bumps the response schema to v2", () => { expect(SCHEMA_VERSION).toBe("economy-dev-snapshot/2"); });

  it("copies the engine's material cost per unit and splits local vs remote", () => {
    expect(by("pa").comparable_unit_cost).toBeCloseTo(2.0, 9);
    expect(by("pb").comparable_unit_cost).toBeCloseTo(2.64, 9);
    expect(by("pb").local_input_unit_cost).toBeCloseTo(1.44, 9);
    expect(by("pb").remote_input_unit_cost).toBeCloseTo(1.2, 9);
    expect(by("pb").transport_unit).toBeCloseTo(4 * 0.3 / 5, 9);
    expect(by("pb").bom[0].actual_source).toBe("C");
    expect(by("pa").bom[0].actual_source).toBe("local");
  });

  it("never shows labor/capital/taxes as zero and never marks cost complete", () => {
    for (const r of rows) {
      expect(r.completeness).not.toBe("complete");
      for (const key of ["labor", "capital", "overhead", "tool_wear", "taxes"]) {
        const c = r.components.find((x) => x.key === key)!;
        expect(c.per_unit).toBeNull(); expect(c.status).toBe("unavailable");
      }
    }
  });

  it("keeps a planned estimate separate from actual cost when nothing was produced", () => {
    const c = by("pc");
    expect(c.comparable_unit_cost).toBeNull();
    expect(c.completeness).toBe("unavailable");
    expect(c.planned_material_unit_cost).toBeCloseTo(2 * 1.5, 9);
    expect(c.provenance).toBe("planned_estimate");
    expect(c.bom[0].actual_source).toBeNull();
    expect(c.bom[0].actual_unit_cost).toBeNull();
    expect(c.rank).toBeNull();
  });

  it("ranks only known costs", () => { expect(by("pa").rank).toBe(1); expect(by("pb").rank).toBe(2); expect(by("pa").rank_of).toBe(2); });

  it("decomposes the A/B delta fully with zero residual and lists unattributable parts", () => {
    const cmp = compareCosts(by("pa"), by("pb"));
    expect(cmp.total_delta).toBeCloseTo(0.64, 9);
    expect(cmp.residual!).toBeCloseTo(0, 9);
    expect(cmp.unattributable).toContain("labor");
    expect(cmp.lines.find((l) => l.key === "grain:transport")!.delta).toBeCloseTo(0.24, 9);
  });

  it("refuses to build a waterfall when one side has no actual cost", () => {
    const cmp = compareCosts(by("pa"), by("pc"));
    expect(cmp.total_delta).toBeNull(); expect(cmp.residual).toBeNull(); expect(cmp.comparable).toBe(false);
  });

  it("old v1 ledger with imports shows landed parts as unavailable, not zero", () => {
    const v1 = buildCosts({ producers: [mill("pb", "B")], prices: [], famous: [], owners,
      diagnostics: [{ ...diags[1], margin: { ...diags[1].margin!, diagnostic_version: undefined, inputs: [{ ...diags[1].margin!.inputs![0], landed_parts: undefined }] } }] })[0];
    expect(v1.diagnostic_version).toBe(1);
    expect(v1.comparable_unit_cost).toBeCloseTo(2.64, 9);
    expect(v1.transport_unit).toBeNull();
  });

  it("catalogue variants are catalogue-only with no fabricated quantities", () => {
    const sp = buildSpecific({ famous: [], variants: [{ id: "v1", parent_good_key: "flour", variant_key: "fine", display_name: "Jemná mouka", quality_modifier: 1.1, prestige_modifier: 0, cultural_origin: null }],
      owners, balances: [], flows: [], choice: [], prices: [], costs: rows, recipesUsing: () => [] });
    expect(sp[0].status).toEqual(["catalogue_only"]);
    expect(sp[0].generic_produced_at_origin).toBeNull();
    expect(sp[0].specific_price).toBeNull();
  });

  it("buildSnapshot exposes costs/specific without changing existing sections", () => {
    const out = buildSnapshot({ snapshot: { producers: [], cities: [] } }, null, []);
    expect(out.costs).toEqual([]); expect(out.specific).toEqual([]);
  });
});
