import { describe, it, expect } from "vitest";
import { battleInRange, maxBattlefieldSquares, validateBattlefield } from "../../supabase/functions/_shared/fieldBattle";
describe("field battle start", () => {
  it("enemy in reach on neighbouring square only", () => { expect(battleInRange({x:-6,y:1},{x:-7,y:2})).toBe(true); expect(battleInRange({x:-6,y:1},{x:-8,y:1})).toBe(false); });
  it("two 8000 armies allow 4 squares", () => expect(maxBattlefieldSquares(16000)).toBe(4));
  it("battlefield must contain both armies and be contiguous", () => {
    const a = {x:0,y:0}, d = {x:1,y:0};
    expect(validateBattlefield([a,d], a, d, 16000)).toBeNull();
    expect(validateBattlefield([a], a, d, 16000)).toMatch(/obou/);
    expect(validateBattlefield([a,d,{x:3,y:0}], a, d, 16000)).toMatch(/navazovat/);
    expect(validateBattlefield([a,d,{x:0,y:1},{x:1,y:1},{x:2,y:0}], a, d, 16000)).toMatch(/nejvýš 4/);
  });
});
