import { expect, it } from "vitest";
import { runTurn21Preview } from "../../scripts/jv72o7-turn21-deactivation-preview";

const r = runTurn21Preview();
it("preview never mutates the committed turn-21 snapshot", () => expect(r.inputUnchanged).toBe(true));
it("replay reproduces committed ledger 21 for Player", () => {
  const p = r.committedReplay.owners.Player;
  expect(p.soldiers).toBeCloseTo(1101, 6);
  expect(p.civilian_workforce).toBe(0);
  expect(p.coverage).toMatchObject({ staple_food: 6.9, drinking_water: 41.1, fuel: 0 });
  expect(p.lines).toMatchObject({ running: 41, no_workers: 39, capacity_labor_or_staffing: 13 });
  expect(r.committedReplay.flows).toBe(0);
});
it("with the current inactive stacks Player keeps all its workers and trade resumes", () => {
  const p = r.deactivated.owners.Player;
  expect(p.soldiers).toBe(0);
  expect(p.civilian_workforce).toBe(755);
  expect(p.coverage).toMatchObject({ staple_food: 100, drinking_water: 100 });
  expect(r.deactivated.flows).toBe(9);
});
it("AI realms are unchanged by the Player's disbanding", () => {
  expect(r.deactivated.owners["AI Frakce 1"]).toEqual(r.committedReplay.owners["AI Frakce 1"]);
  expect(r.deactivated.owners["AI Frakce 2"]).toEqual(r.committedReplay.owners["AI Frakce 2"]);
});
