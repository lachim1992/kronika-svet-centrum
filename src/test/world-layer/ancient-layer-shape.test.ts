import { describe, it, expect } from "vitest";
import { validateAncientLayer } from "@/lib/worldLayer/ancientLayerSchema";

const minimal = {
  version: 1 as const,
  generated_with_prompt_version: 1,
  seed_hash: "abc123",
  reset_event: {
    type: "great_silence",
    description: "The sky fell silent.",
    turn_offset: -500,
  },
  lineage_candidates: [
    { id: "l1", name: "A", description: "x" },
    { id: "l2", name: "B", description: "x" },
    { id: "l3", name: "C", description: "x" },
    { id: "l4", name: "D", description: "x" },
    { id: "l5", name: "E", description: "x" },
  ],
  selected_lineages: [],
  mythic_seeds: [],
};

describe("AncientLayer nested shape (Δ-C)", () => {
  it("rejects when version != 1", () => {
    expect(() =>
      validateAncientLayer({ ...minimal, version: 2 as unknown as 1 })
    ).toThrow();
  });

  it("rejects when reset_event is missing required field", () => {
    const { reset_event, ...rest } = minimal;
    void reset_event;
    const bad = {
      ...rest,
      reset_event: { type: "x", description: "y" }, // missing turn_offset
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects when reset_event.turn_offset is not an integer", () => {
    const bad = {
      ...minimal,
      reset_event: { ...minimal.reset_event, turn_offset: 1.5 },
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects fewer than 5 lineage candidates", () => {
    const bad = {
      ...minimal,
      lineage_candidates: minimal.lineage_candidates.slice(0, 4),
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects more than 8 lineage candidates", () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      id: `l${i}`,
      name: `n${i}`,
      description: "x",
    }));
    const bad = { ...minimal, lineage_candidates: tooMany };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects mythic_seed tag with uppercase or whitespace", () => {
    const bad = {
      ...minimal,
      mythic_seeds: [{ id: "m1", hex_q: 0, hex_r: 0, tag: "Ruin Site" }],
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects mythic_seed hex coords as floats", () => {
    const bad = {
      ...minimal,
      mythic_seeds: [{ id: "m1", hex_q: 0.5, hex_r: 0, tag: "ruin" }],
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("accepts an empty selected_lineages array (pre-wizard state)", () => {
    expect(() =>
      validateAncientLayer({ ...minimal, selected_lineages: [] })
    ).not.toThrow();
  });
});
