import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
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

async function renderPanel(overrides: Record<string, unknown> = {}): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MacroTerritoryPanel {...props} {...overrides} />);
    await Promise.resolve();
  });
  return renderer;
}

describe("macro province assignment guards", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not offer or dispatch a city move to another province", async () => {
    const renderer = await renderPanel({ hasCity: true });
    const select = renderer.root.findByType("select");
    expect(select.props.disabled).toBe(true);
    await act(async () => select.props.onChange({ target: { value: "p2" } }));
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("does not offer a province with no adjacent tile", async () => {
    const renderer = await renderPanel({ assignableProvinceIds: [] });
    expect(renderer.root.findByType("select").props.disabled).toBe(true);
    expect(renderer.root.findAllByType("option").some(option => option.props.value === "p2")).toBe(false);
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("turns a server-side rule rejection into a toast, not an unhandled error", async () => {
    vi.mocked(dispatchCommand).mockResolvedValue({ ok: false, idempotent: false, events: [], error: "Přesun by rozdělil původní provincii na nesouvislé části" });
    const renderer = await renderPanel();
    const select = renderer.root.findByType("select");
    expect(select.props.disabled).toBe(false);
    await act(async () => select.props.onChange({ target: { value: "p2" } }));
    expect(toast.error).toHaveBeenCalledWith("Přesun by rozdělil původní provincii na nesouvislé části");
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
  });
});
