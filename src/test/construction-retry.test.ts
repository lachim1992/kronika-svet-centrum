import { describe, it, expect } from "vitest";
import { constructionStep, notAdvancedIn } from "../../supabase/functions/commit-turn/constructionProgress";

describe("construction progress on turn retry", () => {
  it("level 2 advances 50 per turn", () => {
    expect(constructionStep(0, 2, null, 5)).toEqual({ progress: 50, complete: false });
    expect(constructionStep(50, 2, 5, 6)).toEqual({ progress: 100, complete: true });
  });
  it("retry of the same turn does not advance again", () => {
    expect(constructionStep(50, 2, 5, 5)).toBeNull();
  });
  it("guard filter targets the turn", () => {
    expect(notAdvancedIn(7)).toBe("last_progress_turn.is.null,last_progress_turn.lt.7");
  });
});
