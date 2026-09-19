// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readEconomySnapshot } from "@/lib/economySnapshots";
import { database } from "./engine/fakeProjectionDatabase";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => vi.clearAllMocks());

describe("current economy snapshot reads", () => {
  it.each(["market_shares", "city_market_baskets"] as const)("does not revive history when %s is empty this turn", async table => {
    const db = database();
    db.tables[table] = [{ id: "old", session_id: "world", turn_number: 1 }];
    mocks.from.mockImplementation(db.from);
    expect(await readEconomySnapshot(table, "world", 2)).toEqual([]);
  });

  it("filters the world, turn and player before returning data", async () => {
    const db = database();
    db.tables.city_market_baskets = [
      { id: "yes", session_id: "world", turn_number: 2, player_name: "A" },
      { id: "other-player", session_id: "world", turn_number: 2, player_name: "B" },
      { id: "other-world", session_id: "other", turn_number: 2, player_name: "A" },
      { id: "past", session_id: "world", turn_number: 1, player_name: "A" },
    ];
    mocks.from.mockImplementation(db.from);
    expect((await readEconomySnapshot("city_market_baskets", "world", 2, "A")).map(row => row.id)).toEqual(["yes"]);
  });

  it("loads every page of a large world", async () => {
    const db = database();
    db.tables.market_shares = Array.from({ length: 1201 }, (_, id) => ({ id: String(id), session_id: "world", turn_number: 2 }));
    mocks.from.mockImplementation(db.from);
    const rows = await readEconomySnapshot("market_shares", "world", 2);
    expect(rows).toHaveLength(1201);
    expect(new Set(rows.map(row => row.id)).size).toBe(1201);
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });

  it("does not return an incomplete snapshot when a later page fails", async () => {
    const db = database();
    db.tables.market_shares = Array.from({ length: 501 }, (_, id) => ({ id: String(id), session_id: "world", turn_number: 2 }));
    let calls = 0;
    mocks.from.mockImplementation(table => {
      if (++calls === 2) db.failures.add("market_shares:select");
      return db.from(table);
    });
    await expect(readEconomySnapshot("market_shares", "world", 2)).rejects.toThrow("failed");
  });

  it("rejects an invalid turn before making a query", async () => {
    await expect(readEconomySnapshot("market_shares", "world", -1)).rejects.toThrow("Neplatné");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
