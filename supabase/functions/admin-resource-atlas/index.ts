// admin-resource-atlas: admin-only, read-only. Returns each macro tile's true deposit kinds so the map can paint
// micro-square resource probabilities (microResources.microResourceProbability). Missing deposits are derived in
// memory with the same generator the survey uses; nothing is written.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AuthError, bearer, isAdminUser } from "../_shared/sessionAuth.ts";
import { generateMacroDeposits, goldVeinCells } from "../_shared/geology.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = bearer(req); if (!token) throw new AuthError("Authentication required", 401);
    const { data: u, error: uErr } = await db.auth.getUser(token);
    if (uErr || !u?.user) throw new AuthError("Invalid session", 401);
    if (!(await isAdminUser(db, u.user.id))) throw new AuthError("Admin role required", 403);
    const body = await req.json().catch(() => null);
    const sessionId = body?.sessionId;
    if (typeof sessionId !== "string" || !UUID.test(sessionId)) return json({ error: "sessionId required" }, 400);
    const hexes: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("province_hexes").select("grid_x, grid_y, biome_family, mean_height, is_passable, has_river, coastal, temp_band, moisture_band")
        .eq("session_id", sessionId).order("grid_y").order("grid_x").range(from, from + 999);
      if (error) throw error;
      hexes.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const stored = new Map<string, any[]>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("macro_deposits").select("grid_x, grid_y, deposits").eq("session_id", sessionId).range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r: any) => stored.set(`${r.grid_x},${r.grid_y}`, r.deposits || []));
      if (!data || data.length < 1000) break;
    }
    const { data: seed } = await db.from("geology_seeds").select("salt").eq("session_id", sessionId).maybeSingle();
    const veins = seed ? goldVeinCells(seed.salt, hexes.filter(h => /hill|mountain/i.test(h.biome_family || "")).map(h => ({ x: h.grid_x, y: h.grid_y, biome_family: h.biome_family }))) : null;
    const tiles = hexes.map(h => {
      const key = `${h.grid_x},${h.grid_y}`;
      const deposits = stored.get(key) ?? (seed ? generateMacroDeposits(seed.salt, h.grid_x, h.grid_y, h, veins!) : null);
      return { x: h.grid_x, y: h.grid_y, deposits: deposits ? deposits.map((d: any) => ({ kind: d.kind, grade: d.grade })) : null, surveyed: stored.has(key) };
    });
    return json({ seeded: !!seed, tiles });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message }, 500);
  }
});
