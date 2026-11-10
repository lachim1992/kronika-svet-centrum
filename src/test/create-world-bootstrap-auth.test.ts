import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// create-world-bootstrap writes with the service role, so it must authorize the
// caller (creator/member/admin or internal service key) before doing any work.
describe("create-world-bootstrap caller authorization", () => {
  const src = readFileSync("supabase/functions/create-world-bootstrap/index.ts", "utf8");
  it("authorizes the session caller before normalizing or writing", () => {
    const auth = src.indexOf("await authorizeSessionCaller(req, sb, validated.sessionId)");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(src.indexOf("normalized = normalizeBootstrapRequest(validated)"));
    expect(auth).toBeLessThan(src.indexOf('.from("world_foundations")'));
  });
  it("returns the auth status (401/403) instead of marking the session failed", () => {
    expect(src).toMatch(/authErr instanceof AuthError[\s\S]{0,200}status: authErr\.status/);
  });
});
