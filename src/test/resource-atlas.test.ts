import { describe, it, expect } from "vitest";
import { microAtlasCell } from "@/lib/resourceAtlas";

describe("admin resource atlas", () => {
  it("minerals need the macro deposit", () => {
    expect(microAtlasCell("cliff_edge", "hills", []).all.find(x => x.kind === "iron")).toBeUndefined();
    expect(microAtlasCell("cliff_edge", "hills", [{ kind: "iron" }]).all.find(x => x.kind === "iron")?.p).toBe(.4);
  });
  it("rare chance is shown over a certain everyday resource", () => {
    const c = microAtlasCell("dense_forest", "forest", []);
    // Newly introduced hardwood has the same rare probability as game.
    // Tie-breaking between equally likely resources is display-only.
    expect(["game", "hardwood"]).toContain(c.top); expect(c.p).toBe(.45);
    expect(c.all.find(x => x.kind === "timber")?.p).toBe(1);
  });
});
