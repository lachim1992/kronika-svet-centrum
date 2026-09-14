import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketSharePanel from "@/components/economy/MarketSharePanel";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/economySnapshots", () => ({ readEconomySnapshot: mocks.read }));
vi.mock("@/components/ui/info-tip", () => ({ InfoTip: () => null }));
beforeEach(() => vi.clearAllMocks());
const props = { sessionId: "world", playerName: "A", currentTurn: 2 };

describe("market panel snapshot lifecycle", () => {
  it("refreshes when the turn changes even if the player and world stay the same", async () => {
    mocks.read.mockResolvedValue([]);
    const { rerender } = render(<MarketSharePanel {...props} />);
    await screen.findByText("Tržní data pro aktuální tah nejsou k dispozici");
    rerender(<MarketSharePanel {...props} currentTurn={3} />);
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith("market_shares", "world", 3));
  });

  it("shows query errors instead of reporting an empty successful snapshot", async () => {
    mocks.read.mockRejectedValue(new Error("databáze nedostupná"));
    render(<MarketSharePanel {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("databáze nedostupná");
    expect(screen.queryByText("Tržní data pro aktuální tah nejsou k dispozici")).not.toBeInTheDocument();
  });

  it("ignores an older request that completes after a newer turn", async () => {
    let finishOld!: (value: unknown[]) => void;
    mocks.read.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; })).mockResolvedValue([]);
    const { rerender } = render(<MarketSharePanel {...props} />);
    rerender(<MarketSharePanel {...props} currentTurn={3} />);
    await screen.findByText("Tržní data pro aktuální tah nejsou k dispozici");
    await act(async () => { finishOld([{ player_name: "A", basket_key: "tools" }]); });
    expect(screen.getByText("Tržní data pro aktuální tah nejsou k dispozici")).toBeInTheDocument();
  });
});
