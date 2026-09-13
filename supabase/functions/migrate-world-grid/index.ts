import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * migrate-world-grid — guarded admin workflow converting a legacy hex world to square4.
 * Body: { session_id: string, confirm?: boolean }
 * Without `confirm` it only reports what would change (dry run).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Přihlášení je vyžadováno" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Neplatná session" }, 401);

    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Pouze administrátor může převádět světy" }, 403);

    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body?.session_id;
    const confirm = body?.confirm === true;
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "session_id je povinné" }, 400);

    const { data: foundation } = await sb
      .from("world_foundations")
      .select("session_id, grid_kind, grid_version")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!foundation) return json({ error: "Svět nemá založený základ (world_foundations)" }, 404);

    const countMissing = async (table: string, coords: [string, string]) => {
      const { count } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .or("grid_x.is.null,grid_y.is.null")
        .not(coords[0], "is", null);
      return count ?? 0;
    };

    const report = {
      grid_kind: foundation.grid_kind ?? "hex6",
      grid_version: foundation.grid_version ?? 1,
      tiles_missing: await countMissing("province_hexes", ["q", "r"]),
      cities_missing: await countMissing("cities", ["province_q", "province_r"]),
      nodes_missing: await countMissing("province_nodes", ["hex_q", "hex_r"]),
      armies_missing: await countMissing("military_stacks", ["hex_q", "hex_r"]),
    };

    if (!confirm) {
      return json({
        ok: true,
        dry_run: true,
        session_id: sessionId,
        already_square: report.grid_kind === "square4",
        report,
      });
    }

    // ─── Copy hex coordinates into the topology-neutral square columns ───
    const copy = async (table: string, source: [string, string]) => {
      const { data: rows } = await sb
        .from(table)
        .select(`id, ${source[0]}, ${source[1]}, grid_x, grid_y`)
        .eq("session_id", sessionId);
      let updated = 0;
      for (const row of (rows ?? []) as Array<Record<string, number | null>>) {
        if (row.grid_x !== null && row.grid_y !== null) continue;
        const x = row[source[0]];
        const y = row[source[1]];
        if (x === null || y === null || x === undefined || y === undefined) continue;
        await sb.from(table).update({ grid_x: x, grid_y: y }).eq("id", row.id as unknown as string);
        updated++;
      }
      return updated;
    };

    const migrated = {
      tiles: await copy("province_hexes", ["q", "r"]),
      cities: await copy("cities", ["province_q", "province_r"]),
      nodes: await copy("province_nodes", ["hex_q", "hex_r"]),
      armies: await copy("military_stacks", ["hex_q", "hex_r"]),
    };

    // ─── flow_paths: mirror hex_path into path_cells where missing ───
    const { data: flows } = await sb
      .from("flow_paths")
      .select("id, hex_path, path_cells")
      .eq("session_id", sessionId);
    let flowsMigrated = 0;
    for (const flow of (flows ?? []) as Array<{ id: string; hex_path: unknown; path_cells: unknown }>) {
      if (flow.path_cells || !Array.isArray(flow.hex_path)) continue;
      const cells = (flow.hex_path as Array<Record<string, number>>)
        .filter((cell) => typeof cell?.q === "number" && typeof cell?.r === "number")
        .map((cell) => ({ x: cell.q, y: cell.r }));
      if (!cells.length) continue;
      await sb.from("flow_paths").update({ path_cells: cells }).eq("id", flow.id);
      flowsMigrated++;
    }

    // ─── Mark routes for recomputation on the new topology ───
    await sb.from("province_routes").update({ path_dirty: true }).eq("session_id", sessionId);

    await sb
      .from("world_foundations")
      .update({ grid_kind: "square4", grid_version: Math.max(2, (foundation.grid_version ?? 1) + 1) })
      .eq("session_id", sessionId);

    await sb.from("world_action_log").insert({
      session_id: sessionId,
      action_type: "grid_migration",
      actor: user.email ?? "admin",
      payload: { ...migrated, flows: flowsMigrated, from: report.grid_kind, to: "square4" },
    }).then(() => undefined, () => undefined);

    return json({ ok: true, dry_run: false, session_id: sessionId, migrated: { ...migrated, flows: flowsMigrated } });
  } catch (error) {
    console.error("migrate-world-grid error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
