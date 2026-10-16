import { describe, it, expect } from "vitest";
import { dispatchOutcome } from "../../supabase/functions/ai-faction-turn/dispatchOutcome";

describe("AI build outcome", () => {
  it("refused build is not reported ok", () => {
    expect(dispatchOutcome({ ok: false, error: "Zdroje se mezitím změnily", status: 400 })).toBe("rejected: Zdroje se mezitím změnily");
  });
  it("accepted build is ok", () => {
    expect(dispatchOutcome({ events: [{ id: "e1" }] })).toBe("ok");
  });
});
