import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-wiki-propagate: Creates wiki entries and event refs for concluded festivals.
 * Called after festival conclusion (from client or from games-resolve).
 *
 * Input: { session_id, festival_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, festival_id } = await req.json();
    if (!session_id || !festival_id) {
      return new Response(JSON.stringify({ error: "session_id, festival_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load festival
    const { data: festival } = await sb.from("games_festivals").select("*").eq("id", festival_id).single();
    if (!festival) {
      return new Response(JSON.stringify({ error: "Festival nenalezen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const turnNumber = festival.concluded_turn || festival.finals_turn || 0;

    // Load participants + results
    const [{ data: participants }, { data: results }] = await Promise.all([
      sb.from("games_participants").select("*").eq("festival_id", festival_id),
      sb.from("games_results").select("*").eq("festival_id", festival_id).not("medal", "is", null),
    ]);

    const wikiRefs: any[] = [];
    const entitiesToEnrich: Array<{ id: string; type: string }> = [];

    // ═══ 1. Host city wiki ref ═══
    if (festival.host_city_id) {
      wikiRefs.push({
        session_id, entity_id: festival.host_city_id, entity_type: "city",
        ref_type: "event", ref_id: festival_id,
        ref_label: `Hostitel Velkých her (rok ${turnNumber})`,
        turn_number: turnNumber, impact_score: 5,
        meta: { festival_id, festival_name: festival.name || "Velké hry", role: "host" },
      });
      entitiesToEnrich.push({ id: festival.host_city_id, type: "city" });
    }

    // ═══ 2. Medalists — aggregate by participant ═══
    const medalTally: Record<string, { gold: number; silver: number; bronze: number; participantId: string; player: string }> = {};
    for (const r of (results || [])) {
      if (!medalTally[r.participant_id]) {
        const p = (participants || []).find((pp: any) => pp.id === r.participant_id);
        medalTally[r.participant_id] = { gold: 0, silver: 0, bronze: 0, participantId: r.participant_id, player: p?.player_name || "" };
      }
      if (r.medal === "gold") medalTally[r.participant_id].gold++;
      if (r.medal === "silver") medalTally[r.participant_id].silver++;
      if (r.medal === "bronze") medalTally[r.participant_id].bronze++;
    }

    for (const [partId, tally] of Object.entries(medalTally)) {
      const participant = (participants || []).find((p: any) => p.id === partId);
      if (!participant) continue;

      const medalSummary = `${tally.gold}🥇 ${tally.silver}🥈 ${tally.bronze}🥉`;

      // Person wiki ref (via student -> great_person)
      if (participant.student_id) {
        const { data: student } = await sb.from("academy_students")
          .select("great_person_id").eq("id", participant.student_id).maybeSingle();
        if (student?.great_person_id) {
          wikiRefs.push({
            session_id, entity_id: student.great_person_id, entity_type: "person",
            ref_type: "event", ref_id: festival_id,
            ref_label: `Velké hry: ${medalSummary}`,
            turn_number: turnNumber, impact_score: tally.gold > 0 ? 5 : 3,
            meta: { festival_id, medals: tally },
          });
          entitiesToEnrich.push({ id: student.great_person_id, type: "person" });
        }
      }

      // City wiki ref for medalist's home city
      if (participant.city_id && participant.city_id !== festival.host_city_id) {
        wikiRefs.push({
          session_id, entity_id: participant.city_id, entity_type: "city",
          ref_type: "event", ref_id: festival_id,
          ref_label: `Medailista: ${participant.athlete_name} (${medalSummary})`,
          turn_number: turnNumber, impact_score: tally.gold > 0 ? 4 : 2,
          meta: { festival_id, athlete: participant.athlete_name, player: participant.player_name },
        });
        if (!entitiesToEnrich.some(e => e.id === participant.city_id)) {
          entitiesToEnrich.push({ id: participant.city_id, type: "city" });
        }
      }
    }

    // ═══ 3. Standalone wiki entry for the festival ═══
    const festivalName = festival.name || `Velké hry — rok ${turnNumber}`;
    const hostCityName = festival.host_city_name || "";
    const bestAthlete = festival.best_athlete_id
      ? (participants || []).find((p: any) => p.id === festival.best_athlete_id)
      : null;

    const medalSummaryText = Object.values(medalTally)
      .sort((a, b) => (b.gold * 5 + b.silver * 3 + b.bronze) - (a.gold * 5 + a.silver * 3 + a.bronze))
      .slice(0, 5)
      .map(m => `${m.player}: ${m.gold}🥇 ${m.silver}🥈 ${m.bronze}🥉`)
      .join(", ");

    await sb.from("wiki_entries").upsert({
      session_id,
      entity_type: "event",
      entity_id: festival_id,
      entity_name: festivalName,
      owner_player: festival.host_player || "",
      summary: `${festivalName} v ${hostCityName || "neznámém městě"}. ${bestAthlete ? `Šampion: ${bestAthlete.athlete_name} (${bestAthlete.player_name})` : ""}`,
      ai_description: `${festivalName} se konaly v ${hostCityName || "neznámém městě"}.\n\nMedailová tabulka: ${medalSummaryText || "žádné medaile"}\n\n${bestAthlete ? `Celkový šampion her: ${bestAthlete.athlete_name} z ${bestAthlete.player_name}.` : ""}`,
    }, { onConflict: "session_id,entity_id" });

    // ═══ 4. Insert wiki refs ═══
    if (wikiRefs.length > 0) {
      await sb.from("wiki_event_refs").upsert(wikiRefs, {
        onConflict: "session_id,entity_id,ref_type,ref_id", ignoreDuplicates: true,
      });
    }

    // ═══ 5. Trigger wiki-enrich (best-effort) ═══
    for (const target of entitiesToEnrich.slice(0, 5)) {
      try {
        await sb.functions.invoke("wiki-enrich", {
          body: { sessionId: session_id, entityId: target.id, entityType: target.type, turnNumber },
        });
      } catch (e) { console.error(`Wiki enrich for ${target.id}:`, e); }
    }

    return new Response(JSON.stringify({
      ok: true,
      refsCreated: wikiRefs.length,
      enriched: entitiesToEnrich.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("games-wiki-propagate error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
