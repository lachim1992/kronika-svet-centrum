import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.session }, functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/useSandboxMode", () => ({ isSandboxMode: () => false }));
import { dispatchCommand } from "@/lib/commands";
const command = { sessionId: "test", actor: { name: "Player" }, commandType: "MOVE_STACK", commandPayload: {} };
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ data: { session: null } }); });
it("returns an over-budget rejection without throwing", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: "Na tuto vzdálenost armáda za jedno kolo nedojde." }) } } });
  await expect(dispatchCommand(command)).resolves.toMatchObject({ ok: false, error: "Na tuto vzdálenost armáda za jedno kolo nedojde." });
});
it("returns a session failure without throwing", async () => {
  mocks.session.mockRejectedValue(new Error("Spojení selhalo"));
  await expect(dispatchCommand(command)).resolves.toMatchObject({ ok: false, error: "Spojení selhalo" });
  expect(mocks.invoke).not.toHaveBeenCalled();
});