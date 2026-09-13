import { describe, expect, it } from "vitest";
import { gridDistance, neighbors, projectCell, squareDiamondPoints } from "@/lib/mapTopology";

describe("map topology", () => {
  it("uses exactly four cardinal neighbors for square worlds", () => {
    expect(neighbors("square4", { a: 3, b: 4 })).toEqual([
      { a: 4, b: 4 }, { a: 2, b: 4 }, { a: 3, b: 5 }, { a: 3, b: 3 },
    ]);
  });

  it("uses Manhattan distance for square worlds", () => {
    expect(gridDistance("square4", { a: 0, b: 0 }, { a: 3, b: -2 })).toBe(5);
  });

  it("projects neighboring square cells onto touching diamonds", () => {
    const size = 42;
    const center = projectCell("square4", { a: 0, b: 0 }, size);
    const east = projectCell("square4", { a: 1, b: 0 }, size);
    expect(center).toEqual({ x: 0, y: 0 });
    expect(east).toEqual({ x: 42, y: 21 });
    expect(squareDiamondPoints(center, size)).toBe("0,-21 42,0 0,21 -42,0");
  });
});