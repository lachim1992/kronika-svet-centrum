import { describe, expect, it } from "vitest";
import { PlayerIdentityError, requirePlayerSeat } from "../../supabase/functions/_shared/playerIdentity";

function db(userId: string | null, seat: string | null) {
  return {
    auth: { getUser: async (_token: string) => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from: (table: string) => {
      expect(table).toBe("game_players");
      const query = {
        eq: () => query,
        maybeSingle: async () => ({ data: seat ? { player_name: seat } : null, error: null }),
      };
      return { select: () => query };
    },
  };
}

describe("human command identity", () => {
  it("uses Alice's authenticated seat and ignores the supplied Mallory name", async () => {
    const actor = await requirePlayerSeat(db("user-alice", "Alice") as any, "session-1", { name: "Mallory" }, "valid-jwt");
    expect(actor).toMatchObject({ id: "user-alice", name: "Alice" });
  });
  it("rejects an authenticated user without a seat instead of acting for the requested realm", async () => {
    await expect(requirePlayerSeat(db("user-1", null) as any, "session-1", { name: "Mallory" }, "valid-jwt"))
      .rejects.toMatchObject({ status: 403 });
  });
  it("rejects a missing or invalid login", async () => {
    await expect(requirePlayerSeat(db(null, "Alice") as any, "session-1", { name: "Alice" }, null))
      .rejects.toEqual(new PlayerIdentityError("Authentication required", 401));
    await expect(requirePlayerSeat(db(null, null) as any, "session-1", { name: "Alice" }, "bad-jwt"))
      .rejects.toMatchObject({ status: 401 });
  });
});
