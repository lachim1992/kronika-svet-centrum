import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Find all cities in session
    const { data: cities, error: citiesErr } = await sb
      .from("cities")
      .select("id, name, owner_player, province")
      .eq("session_id", sessionId);

    if (citiesErr || !cities) {
      return new Response(JSON.stringify({ error: "Failed to fetch cities" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find wiki entries with missing content
    const { data: wikiEntries } = await sb
      .from("wiki_entries")
      .select("entity_id, summary, ai_description")
      .eq("session_id", sessionId)
      .eq("entity_type", "city");

    const wikiMap = new Map<string, { summary: string | null; ai_description: string | null }>();
    for (const w of wikiEntries || []) {
      wikiMap.set(w.entity_id, { summary: w.summary, ai_description: w.ai_description });
    }

    // Filter to cities needing generation
    const needsGen = cities.filter(c => {
      const w = wikiMap.get(c.id);
      if (!w) return true;
      const hasSummary = w.summary && w.summary.trim().length > 10;
      const hasDesc = w.ai_description && w.ai_description.trim().length > 20;
      return !hasSummary || !hasDesc;
    });

    const startTime = Date.now();
    let generated = 0;
    let failed = 0;
    const BATCH = 3;
    const MAX_RETRIES = 2;

    for (let i = 0; i < needsGen.length; i += BATCH) {
      const batch = needsGen.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (city) => {
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/wiki-generate`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  entityType: "city",
                  entityName: city.name,
                  entityId: city.id,
                  sessionId,
                  ownerPlayer: city.owner_player,
                  context: { regionName: city.province },
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.aiDescription && data.aiDescription.trim().length > 20) {
                  return data;
                }
              }
            } catch (e) {
              console.error(`Backfill attempt ${attempt + 1} failed for ${city.name}:`, e);
            }
          }
          throw new Error(`Failed after ${MAX_RETRIES} retries: ${city.name}`);
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") generated++;
        else { failed++; console.error("Backfill failed:", r.reason); }
      }
    }

    const durationMs = Date.now() - startTime;

    // Log to simulation_log
    await sb.from("simulation_log").insert({
      session_id: sessionId,
      year_start: 1,
      year_end: 1,
      events_generated: generated,
      scope: "backfill_wiki",
      triggered_by: "admin",
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({
      cities_total: cities.length,
      cities_needing_gen: needsGen.length,
      cities_generated: generated,
      cities_failed: failed,
      duration_ms: durationMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("backfill-wiki error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
