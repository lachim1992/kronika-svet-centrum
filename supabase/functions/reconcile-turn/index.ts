import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * reconcile-turn: admin/moderator recovery for a turn whose guard is "failed".
 * Keeps effects that already happened (no rollback, no replay): a partial
 * world tick is sealed so commit-turn skips it, and the guard becomes
 * "reconciled" so the next commit-turn may finish the remaining phases.
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "Nepřihlášen" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ ok: false, error: "Neplatné sessionId" }, 400);

    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{ data: member }, { data: admin }] = await Promise.all([
      sb.from("game_memberships").select("role").eq("session_id", sessionId).eq("user_id", u.user.id).maybeSingle(),
      sb.from("user_roles").select("id").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!admin && !["admin", "moderator"].includes(String(member?.role))) return json({ ok: false, error: "Jen admin nebo moderátor" }, 403);

    const { data: session } = await sb.from("game_sessions").select("current_turn").eq("id", sessionId).single();
    const turn = session?.current_turn;
    const { data: guard } = await sb.from("turn_execution_guards").select("turn_number,status").eq("session_id", sessionId).maybeSingle();
    if (!guard || guard.status !== "failed" || guard.turn_number !== turn) return json({ ok: true, reconciled: false, reason: "no_failed_turn" });

    // Seal a partial tick: its events/projections stay, they are not re-emitted.
    await sb.from("world_tick_log").update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("session_id", sessionId).eq("turn_number", turn).neq("status", "completed");
    await sb.from("turn_execution_guards").update({ status: "reconciled", finished_at: new Date().toISOString() })
      .eq("session_id", sessionId).eq("turn_number", turn).eq("status", "failed");
    return json({ ok: true, reconciled: true, turn });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
