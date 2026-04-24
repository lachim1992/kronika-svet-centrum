import { describe, it, expect } from "vitest";
import {
  AncientLayerSchema,
  validateAncientLayer,
} from "@/lib/worldLayer/ancientLayerSchema";

const validPayload = {
  version: 1 as const,
  generated_with_prompt_version: 1,
  seed_hash: "abc123",
  reset_event: {
    type: "great_silence",
    description: "The sky fell silent and the old gods withdrew.",
    turn_offset: -500,
  },
  lineage_candidates: [
    { id: "l1", name: "Children of the Thunderlord", description: "..." },
    { id: "l2", name: "Keepers of the Drowned Hall", description: "..." },
    { id: "l3", name: "Heirs of the Ash Wardens", description: "..." },
    { id: "l4", name: "The Wandering Smiths", description: "..." },
    { id: "l5", name: "The Stormbound", description: "..." },
  ],
  selected_lineages: ["l1", "l3"],
  mythic_seeds: [
    { id: "m1", hex_q: 5, hex_r: -3, tag: "ruin" },
    { id: "m2", hex_q: 12, hex_r: 7, tag: "altar" },
  ],
};

describe("AncientLayer L2 whitelist (Track 1)", () => {
  it("accepts a valid minimal payload", () => {
    const parsed = validateAncientLayer(validPayload);
    expect(parsed.version).toBe(1);
    expect(parsed.lineage_candidates).toHaveLength(5);
  });

  it("rejects an extra top-level key (L2 whitelist)", () => {
    const bad = { ...validPayload, runtime_population: 1000 };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects an extra nested key in reset_event", () => {
    const bad = {
      ...validPayload,
      reset_event: { ...validPayload.reset_event, gold_reserve: 500 },
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects an extra nested key in lineage_candidates[]", () => {
    const bad = {
      ...validPayload,
      lineage_candidates: validPayload.lineage_candidates.map((l, i) =>
        i === 0 ? { ...l, control_state: "anchored" } : l
      ),
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects an extra nested key in mythic_seeds[]", () => {
    const bad = {
      ...validPayload,
      mythic_seeds: [
        { ...validPayload.mythic_seeds[0], migration_pull: 0.5 },
      ],
    };
    expect(() => validateAncientLayer(bad)).toThrow();
  });

  it("rejects forbidden runtime-counter keys regardless of position", () => {
    // Sanity: even something innocuous like 'population' is not whitelisted.
    const bad = { ...validPayload, population: 0 };
    expect(() => validateAncientLayer(bad)).toThrow();
  });
});
