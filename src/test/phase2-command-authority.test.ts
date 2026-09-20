import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const DISPATCH = read("supabase/functions/command-dispatch/index.ts");
const ARMY = read("src/pages/game/ArmyTab.tsx");
const COUNCIL = read("src/pages/game/CouncilTab.tsx");
const UPRISING = read("src/components/UprisingDialog.tsx");
const CITY_ACTIONS = read("src/components/map/CityActionsPopover.tsx");

/**
 * Phase 2 — command authority.
 * Canonical gameplay mutations must run through command-dispatch, never from
 * the browser. These are static guards: they fail if a UI file regains a direct
 * write to a canonical table.
 */
describe("phase 2: canonical writes live in command-dispatch", () => {
  // Any UI update touching a fiscal/ledger column of realm_resources.
  const ledgerWrite = /\.update\(\{[^}]*(gold_reserve|grain_reserve|production_reserve|manpower_pool)/;

  it("ArmyTab no longer writes the treasury or inserts generals", () => {
    expect(ledgerWrite.test(ARMY)).toBe(false);
    expect(ARMY).not.toMatch(/from\("generals"\)\s*\.insert/);
    expect(ARMY).not.toMatch(/Math\.random\(\)\s*\*\s*30/);
    expect(ARMY).toMatch(/commandType: "RECRUIT_GENERAL"/);
  });

  it("UprisingDialog resolves through RESOLVE_UPRISING only", () => {
    expect(ledgerWrite.test(UPRISING)).toBe(false);
    // narrative cache writes are fine; resolution state must not be client-side
    expect(UPRISING).not.toMatch(/status: "resolved"/);
    expect(UPRISING).not.toMatch(/chosen_concession/);
    expect(UPRISING).toMatch(/commandType: "RESOLVE_UPRISING"/);
  });

  it("CouncilTab does not write factions or city stability directly", () => {
    expect(COUNCIL).not.toMatch(/from\("city_factions"\)\s*\.update\(/);
    expect(COUNCIL).not.toMatch(/from\("cities"\)\s*\.update\(\{\s*city_stability/);
    expect(COUNCIL).toMatch(/commandType: "APPLY_DECREE_EFFECTS"/);
    expect(COUNCIL).toMatch(/factionImpacts/);
    expect(COUNCIL).toMatch(/stabilityPenalty/);
  });

  it("neutral pacts are signed server-side", () => {
    expect(ledgerWrite.test(CITY_ACTIONS)).toBe(false);
    expect(CITY_ACTIONS).not.toMatch(/from\("neutral_trade_pacts" as any\)\s*\.insert/);
    expect(CITY_ACTIONS).toMatch(/commandType: "SIGN_NEUTRAL_PACT"/);
  });
});

describe("phase 2: server handlers are complete and deterministic", () => {
  it("registers the new canonical commands", () => {
    for (const cmd of ["RECRUIT_GENERAL", "SIGN_NEUTRAL_PACT", "RESOLVE_UPRISING"]) {
      expect(DISPATCH).toContain(`case "${cmd}":`);
    }
    expect(DISPATCH).toMatch(/async function executeRecruitGeneral/);
    expect(DISPATCH).toMatch(/async function executeSignNeutralPact/);
    expect(DISPATCH).toMatch(/async function executeResolveUprising/);
  });

  it("uses a deterministic draw instead of Math.random for the general skill", () => {
    expect(DISPATCH).toMatch(/function commandRandom\(commandId: string/);
    const recruit = DISPATCH.slice(DISPATCH.indexOf("async function executeRecruitGeneral"));
    const body = recruit.slice(0, recruit.indexOf("\n}\n"));
    expect(body).not.toContain("Math.random");
    expect(body).toContain('commandRandom(commandId, "skill")');
  });

  it("checks affordability before charging gold", () => {
    for (const fn of ["executeRecruitGeneral", "executeSignNeutralPact"]) {
      const start = DISPATCH.indexOf(`async function ${fn}`);
      const body = DISPATCH.slice(start, start + 3000);
      expect(body).toMatch(/Nedostatek zlata/);
      expect(body.indexOf("Nedostatek zlata")).toBeLessThan(body.indexOf("gold_reserve: gold -"));
    }
  });

  it("derives the neutral tribute server-side from the settlement level", () => {
    expect(DISPATCH).toMatch(/const NEUTRAL_TRIBUTE: Record<string, number>/);
    const start = DISPATCH.indexOf("async function executeSignNeutralPact");
    const body = DISPATCH.slice(start, start + 3000);
    expect(body).toMatch(/NEUTRAL_TRIBUTE\[level\]/);
    expect(body).not.toMatch(/payload\??\.\.?tribute/);
  });

  it("uprising resolution derives costs from stored demands and keeps one capital", () => {
    const start = DISPATCH.indexOf("async function executeResolveUprising");
    const body = DISPATCH.slice(start, start + 6000);
    expect(body).toMatch(/uprising\.demands/);
    expect(body).toMatch(/cost_percent/);
    expect(body).toMatch(/ensureSingleCapital/);
    // ownership check before any mutation
    expect(body.indexOf("Toto město nepatří")).toBeLessThan(body.indexOf("gold_reserve:"));
    // resolved uprisings cannot be replayed
    expect(body).toMatch(/status === "resolved"/);
  });

  it("decree effects clamp faction values and never exceed bounds", () => {
    const start = DISPATCH.indexOf("const factionImpacts");
    const body = DISPATCH.slice(start, start + 1500);
    expect(body).toMatch(/Math\.max\(0, Math\.min\(100,/);
  });
});
