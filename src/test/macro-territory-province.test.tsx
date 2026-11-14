import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MacroTerritoryPanel from "@/components/map/MacroTerritoryPanel";
import { dispatchCommand } from "@/lib/commands";
import { toast } from "sonner";

vi.mock("@/lib/commands", () => ({ dispatchCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: table === "provinces" ? [{ id: "p1", name: "První" }, { id: "p2", name: "Druhá" }] : null,
        }).then(resolve),
      };
      return chain;
    },
  },
}));

const props = {
  sessionId: "session", playerName: "Player", currentTurn: 7, gridX: 2, gridY: 3,
  owner: "Player", provinceId: "p1", passable: true, biome: "plains", ownedTiles: 8,
  adjacentOwned: true, hasCity: false, assignableProvinceIds: ["p2"], onChanged: vi.fn(),
};

describe("macro province assignment guards", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not offer or dispatch a city move to another province", async () => {
    render(<MacroTerritoryPanel {...props} hasCity />);
    const select = await screen.findByLabelText("Provincie");
    await waitFor(() => expect(select).toBeDisabled());
    fireEvent.change(select, { target: { value: "p2" } });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("does not offer a province with no adjacent tile", async () => {
    render(<MacroTerritoryPanel {...props} assignableProvinceIds={[]} />);
    const select = await screen.findByLabelText("Provincie");
    await waitFor(() => expect(select).toBeDisabled());
    expect(screen.queryByRole("option", { name: "Druhá" })).not.toBeInTheDocument();
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("turns a server-side rule rejection into a toast, not an unhandled error", async () => {
    vi.mocked(dispatchCommand).mockResolvedValue({ ok: false, idempotent: false, events: [], error: "Přesun by rozdělil původní provincii na nesouvislé části" });
    render(<MacroTerritoryPanel {...props} />);
    const select = await screen.findByLabelText("Provincie");
    await waitFor(() => expect(select).toBeEnabled());
    fireEvent.change(select, { target: { value: "p2" } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Přesun by rozdělil původní provincii na nesouvislé části"));
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
  });
});
