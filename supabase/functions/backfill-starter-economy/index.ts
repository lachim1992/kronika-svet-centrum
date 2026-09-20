// backfill-starter-economy: deliberate, idempotent save upgrade for legacy cities.
//
// WRITER CONTRACT:
// - WRITES: city_buildings only (the minimal explicit starter production bundle).
// - NEVER touches population, gold_reserve, fiscal state, inventories, trade flows or history.
// - Idempotent: a second run adds nothing. Use { dryRun: true } to report without writing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureStarterEconomy } from "../_shared/starterEconomy.ts";
import { ensureSingleCapital } from "../_shared/capital.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { session_id, city_id, turn_number, dryRun = true } = await req.json();
    if (!session_id) throw new Error("session_id is required");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const reports = await ensureStarterEconomy(supabase, session_id, {
      cityId: city_id, turnNumber: turn_number, dryRun: dryRun !== false,
    });
    const added = reports.reduce((n, r) => n + r.added.length, 0);
    // Deterministic capital repair for legacy saves without a capital. Same
    // dryRun switch: nothing is written unless the caller passes dryRun: false.
    const capitals = await ensureSingleCapital(supabase, session_id, { dryRun: dryRun !== false });
    return new Response(JSON.stringify({
      success: true, dry_run: dryRun !== false, cities: reports.length, structures_added: added, reports,
      capitals,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String((error as Error).message || error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
