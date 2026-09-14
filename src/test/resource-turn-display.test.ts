import { describe, expect, it } from "vitest";
import { getResourceTurnDisplay, formatResourceDelta } from "../lib/resourceTurnDisplay";

describe("resource HUD ledger balances", () => {
  it("uses applied changes including full silos and a treasury loss", () => {
    const realm = {
      last_processed_turn: 7,
      total_production: 2000, last_turn_grain_net: 10,
      computed_modifiers: { resource_turn: { turn: 7, production: 11, gold: -12, grain: 0 } },
    };
    expect(getResourceTurnDisplay(realm)).toEqual({ turn: 7, production: 11, gold: -12, grain: 0 });
    expect(formatResourceDelta(-12)).toBe("-12");
    expect(formatResourceDelta(0)).toBe("0");
    expect(formatResourceDelta(2.4)).toBe("+2,4");
  });

  it("does not fabricate rates from old worlds or absent snapshots", () => {
    expect(getResourceTurnDisplay({ last_processed_turn: 7 })).toBeNull();
    expect(getResourceTurnDisplay({ computed_modifiers: null })).toBeNull();
  });

  it("rejects a snapshot from a different processed turn", () => {
    expect(getResourceTurnDisplay({ last_processed_turn: 8, computed_modifiers: {
      resource_turn: { turn: 7, production: 11, gold: 2, grain: 0 },
    } })).toBeNull();
  });

  it.each([undefined, null, "12", NaN, Infinity])("rejects incomplete or invalid recorded balances: %s", gold => {
    expect(getResourceTurnDisplay({ last_processed_turn: 7, computed_modifiers: {
      resource_turn: { turn: 7, production: 11, gold, grain: 0 },
    } })).toBeNull();
  });
});
