import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, deleteFirst } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all wiki entries for this session
    const { data: entries, error: fetchError } = await sb
      .from("wiki_entries")
      .select("id, entity_type, entity_id, entity_name, owner_player")
      .eq("session_id", sessionId);

    if (fetchError) throw fetchError;
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No wiki entries found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Regenerate each entry via wiki-orchestrator (Track B): single gateway.
    // The orchestrator handles deletion of stale fields when fields includes 'content'.
    const results: any[] = [];
    const BATCH_SIZE = 3;
    const fields = deleteFirst ? ["content", "image"] : ["content"];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (entry) => {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/wiki-orchestrator`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "regenerate",
              entry_id: entry.id,
              fields,
            }),
          });
          const data = await res.json();
          return { entity: entry.entity_name, type: entry.entity_type, ok: res.ok && data?.ok, ...data };
        } catch (e) {
          return { entity: entry.entity_name, type: entry.entity_type, ok: false, error: String(e) };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      if (i + BATCH_SIZE < entries.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const successCount = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({
      ok: true,
      total: entries.length,
      success: successCount,
      failed: entries.length - successCount,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("batch-regenerate-wiki error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
