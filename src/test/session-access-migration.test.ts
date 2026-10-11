import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const dir = "drizzle/migrations";
const latest = readFileSync(`${dir}/0003_close_session_lobby_and_admin_audit.sql`, "utf8");

describe("game_sessions client write boundary", () => {
  it("revokes all client UPDATE on game_sessions and drops the member update policy", () => {
    expect(latest).toContain("REVOKE UPDATE ON public.game_sessions FROM authenticated");
    expect(latest).toContain("DROP POLICY IF EXISTS game_sessions_member_lobby_update");
    const later = readdirSync(dir).filter((f) => f > "0003").map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
    expect(later).not.toMatch(/GRANT UPDATE[^;]*ON public\.game_sessions TO authenticated/);
  });
  it("lobby and story RPCs require creator or admin", () => {
    for (const fn of ["update_session_lobby", "set_session_generation_status", "end_story_session"]) {
      const body = latest.split(`FUNCTION public.${fn}(`)[1].split("END $$")[0];
      expect(body).toContain("s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin')");
    }
  });
  it("story winner is the caller's own seat, not a client value", () => {
    expect(latest).toMatch(/end_story_session\(p_session uuid\)\n/);
    expect(latest).toContain("WHERE session_id = p_session AND user_id = auth.uid()");
  });
});
