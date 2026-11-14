import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderPanel(overrides: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<MacroTerritoryPanel {...props} {...overrides} />);
    await Promise.resolve();
  });
  return container.querySelector("select")!;
}

describe("macro province assignment guards", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    for (const { root, container } of mounted.splice(0)) {
      await act(async () => root.unmount());
      container.remove();
    }
    vi.unstubAllGlobals();
  });

  it("does not offer or dispatch a city move to another province", async () => {
    const select = await renderPanel({ hasCity: true });
    expect(select.disabled).toBe(true);
    select.value = "p2";
    await act(async () => { select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("does not offer a province with no adjacent tile", async () => {
    const select = await renderPanel({ assignableProvinceIds: [] });
    expect(select.disabled).toBe(true);
    expect([...select.options].some(option => option.value === "p2")).toBe(false);
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("turns a server-side rule rejection into a toast, not an unhandled error", async () => {
    vi.mocked(dispatchCommand).mockResolvedValue({ ok: false, idempotent: false, events: [], error: "Přesun by rozdělil původní provincii na nesouvislé části" });
    const select = await renderPanel();
    expect(select.disabled).toBe(false);
    select.value = "p2";
    await act(async () => { select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(toast.error).toHaveBeenCalledWith("Přesun by rozdělil původní provincii na nesouvislé části");
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
  });
});
