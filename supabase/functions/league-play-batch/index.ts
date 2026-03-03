import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * league-play-batch: Plays multiple rounds of Sphaera league in a single call.
 * Skips AI commentary for intermediate rounds, only generates it for the last one.
 * Input: { session_id, player_name, rounds: number (default 5, max 10) }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, rounds = 5 } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalRounds = Math.min(Math.max(1, rounds), 10);
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const allResults: any[] = [];
    let seasonComplete = false;

    for (let i = 0; i < totalRounds; i++) {
      if (seasonComplete) break;

      const isLastRound = i === totalRounds - 1;

      try {
        const resp = await fetch(`${baseUrl}/functions/v1/league-play-round`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            session_id,
            player_name,
            skip_commentary: !isLastRound,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`Round ${i + 1} failed (${resp.status}):`, errText);
          break;
        }

        const data = await resp.json();
        if (data.error && !data.seasonComplete) {
          console.error(`Round ${i + 1} error:`, data.error);
          break;
        }

        allResults.push({
          round: data.round,
          matches: data.matches,
          seasonComplete: data.seasonComplete,
          playoff: data.playoff,
          commentary: data.commentary || null,
        });

        if (data.seasonComplete) {
          seasonComplete = true;
        }
      } catch (e: any) {
        console.error(`Round ${i + 1} exception:`, e);
        break;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      roundsPlayed: allResults.length,
      roundsRequested: totalRounds,
      results: allResults,
      seasonComplete,
      commentary: allResults[allResults.length - 1]?.commentary || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("league-play-batch error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
