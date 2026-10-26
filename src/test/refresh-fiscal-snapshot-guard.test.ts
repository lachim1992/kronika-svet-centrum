import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fiscalSnapshotsEqual, isReadableFiscalSnapshot,
} from "../../supabase/functions/_shared/fiscalSnapshotGuard";

const rows = [
  { player_name: "alpha", gold_reserve: 100, legitimacy: 50, goods_wealth_fiscal: 3 },
  { player_name: "beta", gold_reserve: 25, legitimacy: 70, goods_wealth_fiscal: 1 },
];

describe("refresh-economy fiscal guard fails closed", () => {
  it("accepts unchanged snapshots regardless of row order, without mutating inputs", () => {
    const before = { data: rows.map(row => ({ ...row })) };
    const after = { data: [...rows].reverse().map(row => ({ ...row })) };
    const originalBefore = JSON.stringify(before);
    const originalAfter = JSON.stringify(after);
    expect(fiscalSnapshotsEqual(before, after)).toBe(true);
    expect(JSON.stringify(before)).toBe(originalBefore);
    expect(JSON.stringify(after)).toBe(originalAfter);
  });

  it("rejects changed fiscal columns and changed player sets", () => {
    expect(fiscalSnapshotsEqual({ data: rows }, {
      data: [{ ...rows[0], gold_reserve: 101 }, rows[1]],
    })).toBe(false);
    expect(fiscalSnapshotsEqual({ data: rows }, { data: [rows[0]] })).toBe(false);
  });

  it("rejects failed reads even when both responses are null", () => {
    expect(fiscalSnapshotsEqual({ data: null }, { data: null })).toBe(false);
    expect(fiscalSnapshotsEqual({ data: rows, error: new Error("read failed") }, { data: rows })).toBe(false);
    expect(fiscalSnapshotsEqual({ data: rows }, { data: rows, error: new Error("read failed") })).toBe(false);
  });

  it("rejects empty, missing-name and duplicate-player snapshots", () => {
    expect(isReadableFiscalSnapshot({ data: [] })).toBe(false);
    expect(isReadableFiscalSnapshot({ data: [{ gold_reserve: 1 }] })).toBe(false);
    expect(isReadableFiscalSnapshot({ data: [rows[0], { ...rows[0] }] })).toBe(false);
    expect(fiscalSnapshotsEqual({ data: [] }, { data: [] })).toBe(false);
  });

  it("checks baseline availability before executing any derived steps", () => {
    const src = readFileSync("supabase/functions/refresh-economy/index.ts", "utf8");
    const baseline = src.indexOf("fiscal_guard_unavailable_before_refresh");
    const chain = src.indexOf("const steps = derivedChainSteps");
    expect(baseline).toBeGreaterThan(0);
    expect(chain).toBeGreaterThan(baseline);
    expect(src).toContain("fiscalBeforeError");
    expect(src).toContain("fiscalAfterError");
    expect(src).toContain("fiscalSnapshotsEqual(");
    expect(src).toContain("fiscal_guard_unavailable_after_refresh");
  });
});
