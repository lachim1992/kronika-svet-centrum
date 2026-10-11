// admin-dev-write: the only write path for in-app admin/dev tools.
// Requires a verified JWT whose user has the 'admin' role. Every operation is
// scoped to the request's session, restricted to an explicit table allowlist,
// can never touch turn/victory columns, and is recorded in admin_audit_log.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AuthError, bearer, isAdminUser } from "../_shared/sessionAuth.ts";
import { validateAdminOp, type AdminOp } from "./policy.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = bearer(req);
    if (!token) throw new AuthError("Authentication required", 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u, error: uErr } = await db.auth.getUser(token);
    if (uErr || !u?.user) throw new AuthError("Invalid or expired session", 401);
    const userId = u.user.id;
    if (!(await isAdminUser(db, userId))) throw new AuthError("Admin role required", 403);

    const body = await req.json().catch(() => null);
    const checked = validateAdminOp(body, userId);
    if (!checked.ok) return json({ error: checked.error }, 400);
    const op: AdminOp = checked.op;

    const { data: session } = await db.from("game_sessions").select("id").eq("id", op.sessionId).maybeSingle();
    if (!session) return json({ error: "Unknown session" }, 404);

    // Composition rows have no session_id: every targeted row's stack must belong to the session.
    if (op.table === "military_stack_composition") {
      let q = db.from("military_stack_composition").select("stack_id");
      for (const f of op.filters) q = applyFilter(q, f);
      const { data: rows, error } = await q;
      if (error) throw error;
      const stackIds = [...new Set((rows || []).map((r: { stack_id: string }) => r.stack_id))];
      if (stackIds.length) {
        const { data: stacks, error: sErr } = await db.from("military_stacks").select("id").in("id", stackIds).eq("session_id", op.sessionId);
        if (sErr) throw sErr;
        if ((stacks || []).length !== stackIds.length) return json({ error: "Row outside session scope" }, 403);
      }
    }

    let q: any = db.from(op.table);
    if (op.action === "insert") q = q.insert(op.values);
    else if (op.action === "upsert") q = q.upsert(op.values, { onConflict: op.onConflict, ignoreDuplicates: op.ignoreDuplicates });
    else if (op.action === "update") q = q.update(op.values);
    else q = q.delete();
    if (op.action === "update" || op.action === "delete") {
      for (const f of op.filters) q = applyFilter(q, f);
    }
    if (op.select) q = q.select(op.select);
    const { data, error } = await q;

    await db.from("admin_audit_log").insert({
      session_id: op.sessionId, user_id: userId, table_name: op.table, action: op.action,
      filters: op.filters, payload: op.values ?? null, ok: !error, error: error?.message ?? null,
      rows_affected: Array.isArray(data) ? data.length : null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data ?? null });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message }, 500);
  }
});

function applyFilter(q: any, f: AdminOp["filters"][number]) {
  switch (f.op) {
    case "eq": return q.eq(f.column, f.value);
    case "neq": return q.neq(f.column, f.value);
    case "ilike": return q.ilike(f.column, f.value as string);
    case "in": return q.in(f.column, f.value as unknown[]);
    case "is": return q.is(f.column, f.value as null);
  }
}
