import { describe, expect, it } from "vitest";
import { getCommitTurnIssues } from "@/lib/commitTurnResult";

describe("turn result reporting", () => {
  it("does not trust HTTP success or a top-level ok when a phase failed", () => {
    expect(getCommitTurnIssues({
      ok: true, newTurn: 2, results: { economy: { failures: [{ name: "Alice", error: "write failed" }] } },
    })).toEqual(["economy/Alice: write failed"]);
  });
  it("rejects failed nested refresh steps and explicit false results", () => {
    expect(getCommitTurnIssues({
      ok: true, results: { economyRefresh: { steps: [{ name: "goods", ok: false, detail: "missing data" }] } },
    })).toHaveLength(1);
    expect(getCommitTurnIssues({ ok: false })).toHaveLength(1);
    expect(getCommitTurnIssues(null)).toHaveLength(1);
  });
  it("accepts a complete successful server result", () => {
    expect(getCommitTurnIssues({ ok: true, results: { economy: { ok: true, failures: [] } } })).toEqual([]);
  });
});
