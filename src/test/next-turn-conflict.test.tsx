import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/realm/TurnExecutionReport", () => ({ saveCommitTurnReport: vi.fn() }));
import { useNextTurn } from "@/hooks/useNextTurn";

describe("blocked turn handling", () => {
  it("does not call commit-turn for an already resolving session", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    invoke.mockClear();
    let hook: ReturnType<typeof useNextTurn> | undefined;
    function Probe() {
      hook = useNextTurn({ sessionId: "s", currentTurn: 1, playerName: "p", resolvingTurn: 2, onComplete: vi.fn() });
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Probe />));
      await act(async () => { await hook?.processNextTurn(); });
      expect(hook?.turnProblem).not.toBeNull();
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
  it("keeps an old-server 409 as displayable state and blocks repeated requests", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    invoke.mockReset();
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ ok: false, error: "Blocked" }), { status: 409 }) } });
    let hook: ReturnType<typeof useNextTurn> | undefined;
    function Probe() {
      hook = useNextTurn({ sessionId: "s", currentTurn: 1, playerName: "p", onComplete: vi.fn() });
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Probe />));
      await act(async () => { await hook?.processNextTurn(); });
      expect(hook?.turnProblem).toBe("Blocked");
      await act(async () => { await hook?.processNextTurn(); });
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});