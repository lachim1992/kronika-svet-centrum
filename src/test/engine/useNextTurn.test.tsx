import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNextTurn } from "@/hooks/useNextTurn";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  report: vi.fn(),
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/components/realm/TurnExecutionReport", () => ({ saveCommitTurnReport: mocks.report }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
const options = { sessionId: "world", currentTurn: 1, playerName: "A", onComplete: vi.fn() };

beforeEach(() => { vi.clearAllMocks(); });

describe("useNextTurn", () => {
  it("sends one server commit without a second projection refresh", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, newTurn: 2, results: {} }, error: null });
    const { result } = renderHook(() => useNextTurn(options));
    await act(async () => { await result.current.processNextTurn(); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toBe("commit-turn");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(options.onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not label a partially committed economy failure as success", async () => {
    mocks.invoke.mockResolvedValue({
      data: { ok: false, newTurn: 2, results: { economy: { failures: [{ name: "A", error: "write failed" }] } } },
      error: null,
    });
    const { result } = renderHook(() => useNextTurn(options));
    await act(async () => { await result.current.processNextTurn(); });
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(mocks.report.mock.calls[0][0].ok).toBe(false);
    expect(options.onComplete).toHaveBeenCalled();
  });

  it("blocks two immediate clicks before React has rerendered", async () => {
    let resolve!: (value: unknown) => void;
    mocks.invoke.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useNextTurn(options));
    await act(async () => {
      const first = result.current.processNextTurn();
      const second = result.current.processNextTurn();
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      resolve({ data: { ok: true, newTurn: 2, results: {} }, error: null });
      await Promise.all([first, second]);
    });
    expect(result.current.processing).toBe(false);
  });
});
