import { getServiceClient, loadWorldPremise, invokeAI } from "../_shared/ai-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * turn-briefing: Generates an AI advisor briefing for a player at the start of a new turn.
 * Gathers all events, battles, buildings, rumors, uprisings, crises from the previous turn,
 * plus watched city/province data, and produces a narrative "advisor report".
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, turnNumber } = await req.json();
    if (!sessionId || !playerName) {
      return json({ error: "sessionId and playerName required" }, 400);
    }

    const sb = getServiceClient();
    const lastTurn = (turnNumber || 1) - 1;
    if (lastTurn < 1) return json({ briefing: null, reason: "first_turn" });

    // Check cache
    const { data: cached } = await sb
      .from("turn_briefings")
      .select("briefing_text, watched_reports, data_summary")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("turn_number", lastTurn)
      .maybeSingle();

    if (cached) {
      return json({
        briefing: cached.briefing_text,
        watched: cached.watched_reports,
        summary: cached.data_summary,
        cached: true,
      });
    }

    // Gather all data from lastTurn in parallel
    const [
      { data: events },
      { data: battles },
      { data: rumors },
      { data: buildings },
      { data: uprisings },
      { data: crises },
      { data: declarations },
      { data: watches },
      { data: myCities },
    ] = await Promise.all([
      sb.from("game_events").select("event_type, note, importance, player, city_id")
        .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("confirmed", true).limit(60),
      sb.from("battles").select("result, casualties_attacker, casualties_defender, attacker_stack_id, defender_city_id, speech_text")
        .eq("session_id", sessionId).eq("turn_number", lastTurn).limit(20),
      sb.from("city_rumors").select("text, tone_tag, city_name")
        .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("is_draft", false).limit(15),
      sb.from("city_buildings").select("name, city_id, status")
        .eq("session_id", sessionId).eq("completed_turn", lastTurn).limit(20),
      sb.from("city_uprisings").select("city_id, escalation_level, status, demands")
        .eq("session_id", sessionId).eq("turn_triggered", lastTurn).limit(10),
      sb.from("world_crises").select("title, status, severity")
        .eq("session_id", sessionId).limit(10),
      sb.from("declarations").select("title, declaration_type, player_name, tone")
        .eq("session_id", sessionId).eq("turn_number", lastTurn).limit(10),
      sb.from("player_watches").select("entity_type, entity_id, entity_name")
        .eq("session_id", sessionId).eq("player_name", playerName),
      sb.from("cities").select("id, name, population_total, city_stability, owner_player, famine_turn, epidemic_active")
        .eq("session_id", sessionId).eq("owner_player", playerName),
    ]);

    // Get watched city details
    const watchedReports: any[] = [];
    const watchedCityIds = (watches || []).filter((w: any) => w.entity_type === "city").map((w: any) => w.entity_id);

    if (watchedCityIds.length > 0) {
      const { data: watchedCities } = await sb
        .from("cities")
        .select("id, name, population_total, city_stability, owner_player, famine_turn, epidemic_active, settlement_level")
        .in("id", watchedCityIds);

      for (const city of (watchedCities || [])) {
        // Get events for this city
        const cityEvents = (events || []).filter((e: any) => e.city_id === city.id);
        const cityRumors = (rumors || []).filter((r: any) => r.city_name === city.name);

        watchedReports.push({
          type: "city",
          name: city.name,
          owner: city.owner_player,
          population: city.population_total,
          stability: city.city_stability,
          famine: city.famine_turn,
          epidemic: city.epidemic_active,
          events: cityEvents.map((e: any) => e.note).slice(0, 5),
          rumors: cityRumors.map((r: any) => r.text).slice(0, 3),
        });
      }
    }

    // Build data summary for structured display
    const dataSummary = {
      battles: (battles || []).length,
      events: (events || []).length,
      buildings_completed: (buildings || []).length,
      uprisings: (uprisings || []).length,
      active_crises: (crises || []).filter((c: any) => c.status === "active").length,
      declarations: (declarations || []).length,
      watched_cities: watchedReports.length,
      my_cities: (myCities || []).length,
      total_population: (myCities || []).reduce((s: number, c: any) => s + (c.population_total || 0), 0),
      avg_stability: Math.round(
        (myCities || []).reduce((s: number, c: any) => s + (c.city_stability || 50), 0) / Math.max((myCities || []).length, 1)
      ),
    };

    // Build prompt for AI
    const premise = await loadWorldPremise(sessionId, sb);

    const dataBlock = JSON.stringify({
      turn: lastTurn,
      player: playerName,
      battles: (battles || []).map((b: any) => ({
        result: b.result,
        casualties: `${b.casualties_attacker}/${b.casualties_defender}`,
      })),
      events: (events || []).slice(0, 20).map((e: any) => ({
        type: e.event_type,
        note: e.note,
        importance: e.importance,
      })),
      buildings_completed: (buildings || []).map((b: any) => b.name),
      uprisings: (uprisings || []).map((u: any) => ({
        level: u.escalation_level,
        status: u.status,
      })),
      crises: (crises || []).filter((c: any) => c.status === "active").map((c: any) => ({
        title: c.title,
        severity: c.severity,
      })),
      declarations: (declarations || []).map((d: any) => ({
        title: d.title,
        type: d.declaration_type,
        from: d.player_name,
      })),
      my_cities: (myCities || []).map((c: any) => ({
        name: c.name,
        pop: c.population_total,
        stability: c.city_stability,
        famine: c.famine_turn,
        epidemic: c.epidemic_active,
      })),
      watched: watchedReports.slice(0, 5),
      rumors: (rumors || []).slice(0, 8).map((r: any) => ({
        city: r.city_name,
        text: r.text,
        tone: r.tone_tag,
      })),
    }, null, 0);

    const systemPrompt = `${premise.loreBible ? `Lore Bible:\n${premise.loreBible}\n\n` : ""}Jsi hlavní poradce vládce ${playerName}. Piš česky, stručně, jako rádce na ranní audienci. Používej styl „Vaše Výsosti…" nebo „Pane…".

Tvým úkolem je shrnout události minulého roku (kola ${lastTurn}) do krátkého briefingu o 3–8 odstavcích:
1. **Začni** nejdůležitějšími událostmi (bitvy, krize, vzpoury).
2. **Pokračuj** stavební aktivitou, ekonomikou, diplomatickými prohlášeními.
3. **Zakonči** sledovanými městy/provinciemi — stručně zmíň jejich stav.
4. Pokud se nestalo nic zásadního, řekni to krátce.

Formátuj v Markdown. Používej **tučné** pro důležitá jména a čísla. Nepoužívej nadpisy #, jen odstavce.
Piš max 400 slov. Nikdy nevymýšlej data — interpretuj jen to, co dostáváš.`;

    const result = await invokeAI({
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt: `Data pro briefing roku ${lastTurn}:\n\n${dataBlock}`,
      maxTokens: 800,
    }, { sessionId, requestId: `briefing-${sessionId}-${lastTurn}`, premise, premisePrompt: "", turnNumber: lastTurn });

    const briefingText = result.ok && result.data?.choices?.[0]?.message?.content
      ? result.data.choices[0].message.content
      : generateFallbackBriefing(dataSummary, lastTurn, playerName);

    // Cache the briefing
    await sb.from("turn_briefings").upsert({
      session_id: sessionId,
      player_name: playerName,
      turn_number: lastTurn,
      briefing_text: briefingText,
      watched_reports: watchedReports,
      data_summary: dataSummary,
    }, { onConflict: "session_id,player_name,turn_number" });

    return json({
      briefing: briefingText,
      watched: watchedReports,
      summary: dataSummary,
      cached: false,
    });
  } catch (e: any) {
    console.error("turn-briefing error:", e);
    return json({ error: e.message }, 500);
  }
});

function generateFallbackBriefing(summary: any, turn: number, player: string): string {
  const parts: string[] = [];
  parts.push(`**Hlášení za rok ${turn}**, Vaše Výsosti.`);

  if (summary.battles > 0) parts.push(`Proběhlo **${summary.battles}** bitev.`);
  if (summary.uprisings > 0) parts.push(`⚠️ Vypuklo **${summary.uprisings}** vzpour!`);
  if (summary.buildings_completed > 0) parts.push(`Dokončeno **${summary.buildings_completed}** staveb.`);
  if (summary.active_crises > 0) parts.push(`Aktivních krizí: **${summary.active_crises}**.`);
  if (summary.declarations > 0) parts.push(`Zaznamenáno **${summary.declarations}** prohlášení.`);

  parts.push(`\nVaše říše čítá **${summary.my_cities}** měst s **${summary.total_population}** obyvateli. Průměrná stabilita: **${summary.avg_stability}%**.`);

  if (summary.watched_cities > 0) parts.push(`Sledováno **${summary.watched_cities}** cizích měst.`);

  if (parts.length <= 2) parts.push("Rok byl klidný, žádné zásadní události.");

  return parts.join("\n\n");
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
