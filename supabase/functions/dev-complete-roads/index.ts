// DEV ONLY — Force-completes all under_construction province_routes for a session.
// Bypasses RLS via service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: routes, error } = await supabase
      .from("province_routes")
      .select("id, metadata")
      .eq("session_id", session_id)
      .eq("construction_state", "under_construction");
    if (error) throw error;

    let updated = 0;
    for (const r of routes || []) {
      const md = (r.metadata as any) || {};
      const total = Number(md.total_work || 0) || 1;
      const newMd = { ...md, progress: total, dev_completed: true };
      const { error: uErr } = await supabase
        .from("province_routes")
        .update({
          construction_state: "complete",
          control_state: "open",
          metadata: newMd,
          path_dirty: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (!uErr) updated++;
    }

    return new Response(JSON.stringify({ ok: true, updated, total: routes?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
