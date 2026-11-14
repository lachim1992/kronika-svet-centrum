import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const { invoke, read } = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      read(table);
      const query: any = {};
      for (const method of ["select", "eq", "limit", "not", "order", "in", "maybeSingle"])
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
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      for (const [playerName, currentTurn] of [["Hráč", 7], ["Player", 7], ["Player", 8]] as const) {
        await act(async () => root.render(<IsometricSquareMap sessionId="test" playerName={playerName} currentTurn={currentTurn} />));
      }
      await act(async () => root.render(null));
      await act(async () => root.render(<IsometricSquareMap sessionId="test" playerName="Player" currentTurn={8} />));
      expect(read).toHaveBeenCalledWith("tile_parcels");
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});