import { beforeEach, expect, it, vi } from "vitest";
import { turnResolvingRefusal, TURN_RESOLVING_MESSAGE } from "../../supabase/functions/_shared/commandGate";
const mocks = vi.hoisted(() => ({ session: vi.fn(), invoke: vi.fn(), resolving: { value: null as number | null } }));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { resolving_turn: mocks.resolving.value }, error: null }) };
  return { supabase: { auth: { getSession: mocks.session }, functions: { invoke: mocks.invoke }, from: () => q } };
});
vi.mock("@/hooks/useSandboxMode", () => ({ isSandboxMode: () => false }));
import { dispatchCommand } from "@/lib/commands";
const command = { sessionId: "s", actor: { name: "Player" }, commandType: "DISBAND_STACK", commandPayload: { stackId: "x" } };
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ data: { session: null } }); mocks.resolving.value = null; });

it("server gate refuses players during resolution with a normal refusal, not an error status", () => {
  expect(turnResolvingRefusal({ resolving_turn: 20 }, "player")).toEqual({ ok: false, idempotent: false, events: [], code: "TURN_RESOLVING", error: TURN_RESOLVING_MESSAGE });
  expect(turnResolvingRefusal({ resolving_turn: null }, "player")).toBeNull();
});
it("AI and system actors still act inside the resolution", () => {
  expect(turnResolvingRefusal({ resolving_turn: 20 }, "ai_faction")).toBeNull();
  expect(turnResolvingRefusal({ resolving_turn: 20 }, "system")).toBeNull();
});
it("a command sent while the turn closes returns a message and never calls the server", async () => {
  mocks.resolving.value = 20;
  await expect(dispatchCommand(command)).resolves.toMatchObject({ ok: false, error: TURN_RESOLVING_MESSAGE });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("if the turn starts closing between check and send, the server refusal is returned, not thrown", async () => {
  mocks.invoke.mockResolvedValue({ data: turnResolvingRefusal({ resolving_turn: 20 }, "player"), error: null });
  await expect(dispatchCommand(command)).resolves.toMatchObject({ ok: false, error: TURN_RESOLVING_MESSAGE });
});
it("command-dispatch answers the busy state with HTTP 200", () => {
  const src = require("node:fs").readFileSync("supabase/functions/command-dispatch/index.ts", "utf8");
  expect(src).toMatch(/const busy = turnResolvingRefusal\(session, trustedInternal \? actor\?\.type : "player"\);\s*if \(busy\) return json\(busy, 200\);/);
});
