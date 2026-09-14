// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ECONOMY_REFRESH_STEPS, refreshEconomy } from "../../../supabase/functions/_shared/economy-refresh";
import { loadEdgeFunction } from "./loadEdgeFunction";

describe("economy projection pipeline", () => {
  it("publishes node output before recipes and solves basket trade last, once each", async () => {
    const output = { production: 1 };
    const seen: string[] = [];
    const invoke = vi.fn(async (name, body) => {
      expect(body.session_id).toBe("world");
      expect(body).not.toHaveProperty("sessionId");
      seen.push(name);
      if (name === "compute-economy-flow") output.production = 12;
      if (name === "compute-trade-flows") expect(output.production).toBe(12);
      if (name === "compute-basket-trade-flows") expect(seen).toContain("compute-trade-flows");
      return { data: { ok: true } };
    });
    const result = await refreshEconomy("world", invoke);
    expect(result.ok).toBe(true);
    expect(seen).toEqual([
      "compute-province-routes", "compute-hex-flows", "compute-economy-flow",
      "compute-trade-systems", "compute-trade-flows", "compute-basket-trade-flows",
    ]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(invoke.mock.calls[1][1]).toEqual({ session_id: "world", force_all: true });
  });

  it.each(["transport", "application", "throw"])("stops dependent writes after a %s error", async (kind) => {
    const invoke = vi.fn(async (name) => {
      if (name === "compute-hex-flows") {
        if (kind === "throw") throw new Error("broken topology");
        if (kind === "transport") return { error: { message: "broken topology" } };
        return { data: { ok: false, error: "broken topology" } };
      }
      return { data: { ok: true } };
    });
    const result = await refreshEconomy("world", invoke);
    expect(result.ok).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.steps).toHaveLength(ECONOMY_REFRESH_STEPS.length);
    expect(result.steps.slice(2).every((step) => step.skipped && !step.ok)).toBe(true);
    expect(result.refreshed_domains).toEqual([]);
  });

  it.each([null, undefined, {}, { ok: "true" }])("rejects a missing or malformed confirmation: %j", async data => {
    const invoke = vi.fn(async () => ({ data }));
    const result = await refreshEconomy("world", invoke);
    expect(result.ok).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.steps.slice(1).every(step => step.skipped)).toBe(true);
  });

  it("releases the session guard even if setup throws after consuming the body", async () => {
    let broken = true;
    const handler = loadEdgeFunction("refresh-economy", {
      env: () => { if (broken) throw new Error("configuration failure"); return "test"; },
      fetch: vi.fn(async () => Response.json({ ok: true })),
    });
    const request = () => new Request("https://local", { method: "POST", body: JSON.stringify({ session_id: "world" }) });
    expect((await handler(request())).status).toBe(400);
    broken = false;
    expect((await handler(request())).status).toBe(200);
  });

  it("rejects recalcOnly before creating any database client", async () => {
    const createClient = vi.fn(() => { throw new Error("must not run"); });
    const handler = loadEdgeFunction("process-turn", { createClient });
    const response = await handler(new Request("https://local", {
      method: "POST", body: JSON.stringify({ sessionId: "world", playerName: "player", recalcOnly: true }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("refresh-economy");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("legacy Recompute All never applies process-turn even when playerName is supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      ok: true, totalMs: 1, steps: [{ name: "projection", ok: true, durationMs: 1 }],
    }));
    const handler = loadEdgeFunction("recompute-all", { fetch: fetchMock });
    const response = await handler(new Request("https://local", {
      method: "POST", body: JSON.stringify({ sessionId: "world", playerName: "player" }),
    }));
    expect((await response.json()).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/refresh-economy");
  });

  it("does not accept an empty step list as a successful recompute", async () => {
    const handler = loadEdgeFunction("recompute-all", {
      fetch: vi.fn(async () => Response.json({ ok: true, steps: [] })),
    });
    const response = await handler(new Request("https://local", {
      method: "POST", body: JSON.stringify({ sessionId: "world" }),
    }));
    expect((await response.json()).ok).toBe(false);
  });
});
