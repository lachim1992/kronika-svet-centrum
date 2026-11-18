import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const { invoke, read } = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: any = {};
      query.select = (columns: string) => { read(table, columns); return query; };
      for (const method of ["eq", "neq", "or", "limit", "not", "order", "in", "maybeSingle"])
        query[method] = () => query;
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return query;
    },
    functions: { invoke },
  },
}));
vi.mock("@/hooks/useManagementReport", () => ({ useManagementReport: () => ({ data: null }) }));
import IsometricSquareMap from "@/components/map/IsometricSquareMap";

describe("read-only map updates", () => {
  it("never invokes seeding on mount, player changes, turn changes or remount", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      for (const [playerName, currentTurn] of [["Hráč", 7], ["Player", 7], ["Player", 8]] as const) {
        await act(async () => root.render(<IsometricSquareMap sessionId="test" playerName={playerName} currentTurn={currentTurn} />));
      }
      await act(async () => root.render(null));
      await act(async () => root.render(<IsometricSquareMap sessionId="test" playerName="Player" currentTurn={8} />));
      expect(read).toHaveBeenCalledWith("tile_parcels", expect.any(String));
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("loads claim_kind for the world city-footprint parcel read", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<IsometricSquareMap sessionId="test" playerName="Player" currentTurn={8} />));
      const cityParcelRead = read.mock.calls.find(([table, columns]) =>
        table === "tile_parcels" && String(columns).includes("land_use"));
      expect(cityParcelRead?.[1]).toContain("claim_kind");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
