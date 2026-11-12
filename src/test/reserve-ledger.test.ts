import { describe, it, expect } from "vitest";
import { chargeReserves, refundReserves, type ReserveIO, type ReserveRow } from "../../supabase/functions/_shared/reserveLedger";

function fakeRow(gold: number, prod: number, concurrentWrites = 0) {
  const row: ReserveRow = { id: "r", gold_reserve: gold, production_reserve: prod };
  let pending = concurrentWrites, writes = 0;
  const io: ReserveIO = {
    async read() { return { ...row }; },
    async cas(e, next) {
      if (pending > 0) { pending--; row.production_reserve = (row.production_reserve ?? 0) + 0.041; return false; }
      if (Math.abs((e.gold_reserve ?? 0) - (row.gold_reserve ?? 0)) > 1e-6) return false;
      if (Math.abs((e.production_reserve ?? 0) - (row.production_reserve ?? 0)) > 1e-6) return false;
      Object.assign(row, next); writes++; return true;
    },
  };
  return { row, io, writes: () => writes };
}

describe("reserve ledger (build/upgrade/district payment)", () => {
  it("charges a farm (10 gold, 20 production) exactly once", async () => {
    const f = fakeRow(80, 50.277);
    const r = await chargeReserves(f.io, { gold: 10, production: 20 });
    expect(r.ok).toBe(true);
    expect(f.row.gold_reserve).toBe(70);
    expect(f.row.production_reserve).toBeCloseTo(30.277, 9);
    expect(f.writes()).toBe(1);
  });
  it("survives a concurrent turn credit and keeps that credit", async () => {
    const f = fakeRow(80, 50, 1);
    const r = await chargeReserves(f.io, { gold: 10, production: 20 });
    expect(r.ok).toBe(true);
    expect(f.row.production_reserve).toBeCloseTo(30.041, 9);
  });
  it("refuses when short and does not write", async () => {
    const f = fakeRow(80, 15.038);
    const r = await chargeReserves(f.io, { gold: 10, production: 20 });
    expect(r.ok).toBe(false);
    expect(f.writes()).toBe(0);
    expect(f.row.production_reserve).toBe(15.038);
  });
  it("refund adds back the cost without erasing a later credit", async () => {
    const f = fakeRow(80, 50);
    await chargeReserves(f.io, { gold: 10, production: 20 });
    f.row.production_reserve = (f.row.production_reserve ?? 0) + 0.5; // credit landed after charge
    expect(await refundReserves(f.io, { gold: 10, production: 20 })).toBe(true);
    expect(f.row.gold_reserve).toBe(80);
    expect(f.row.production_reserve).toBeCloseTo(50.5, 9);
  });
});

import { chargeReserves as charge2 } from "../../supabase/functions/_shared/reserveLedger";
describe("fractional gold", () => {
  it("charges whole gold only and reports write errors", async () => {
    let row = { id: "r", gold_reserve: 80, production_reserve: 50 };
    const io = { read: async () => row, cas: async (_e: any, nx: any) => { row = { ...row, ...nx }; return true; } };
    const r = await charge2(io, { gold: 9.5, production: 20 });
    expect(r.ok).toBe(true);
    expect(row.gold_reserve).toBe(70);
    const bad = { read: async () => row, cas: async () => { throw new Error("boom"); } };
    const r2 = await charge2(bad, { gold: 1, production: 1 });
    expect(r2.ok).toBe(false);
    expect((r2 as { error?: string }).error).toContain("boom");
  });
});
