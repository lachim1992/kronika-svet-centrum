import { getServiceClient, loadWorldPremise, invokeAI } from "../_shared/ai-context.ts";
import { buildBasketSnapshot } from "../_shared/basket-context.ts";

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

    const systemPrompt = `${premise.loreBible ? `Lore Bible:\n${premise.loreBible}\n\n` : ""}Jsi hlavní dvorní rádce vládce ${playerName}. Tvým úkolem je sepsat formální písemné hlášení — elaborát — o událostech minulého roku (kola ${lastTurn}).

STYL:
- Piš jako dvorní rádce předkládající písemnou zprávu svému pánu: „Vaše Výsosti, dovolte mi předložiti zprávu o uplynulém roce…"
- Styl formálního dvorního elaborátu — souvislý text, nikoli odrážky ani čísla vytržená z kontextu.
- Každý údaj MUSÍŠ zasadit do kontextu a vysvětlit jeho význam. Nepiš „2 bitvy", piš „Vaše armády se střetly dvakrát — u bran města X a na hranicích provincie Y, přičemž obě střetnutí skončily…"
- Pokud hrozí krize (hladomor, epidemie, vzpoura), formuluj to jako naléhavé varování s doporučením.
- Pokud se nic zásadního nestalo, piš o konsolidaci a stabilitě říše, ale stručně.

STRUKTURA (plynulý text, NE sekce s nadpisy):
1. Úvodní oslovení a celkové zhodnocení roku.
2. Nejzávažnější události (bitvy, vzpoury, krize, vyhlášení války) — vyprávěj je, dej do kontextu, zmiň důsledky.
3. Diplomatické a politické záležitosti (prohlášení, jednání, ultimáta).
4. Hospodářství a stavební činnost — co bylo dokončeno, jaký to má dopad.
5. Zprávy o sledovaných cizích městech/provinciích — co zvědové zjistili.
6. Závěrečné doporučení — co by měl vládce řešit prioritně.

Formátuj v Markdown. Používej **tučné** pro důležitá jména a čísla. Nepoužívej nadpisy # ani odrážky. Piš max 600 slov. Nikdy nevymýšlej data — interpretuj a převypravuj jen to, co dostáváš.`;

    const result = await invokeAI(
      { sessionId, requestId: `briefing-${sessionId}-${lastTurn}`, premise, premisePrompt: "", turnNumber: lastTurn },
      {
        model: "google/gemini-2.5-flash",
        systemPrompt,
        userPrompt: `Data pro briefing roku ${lastTurn}:\n\n${dataBlock}`,
        maxTokens: 1200,
      },
    );

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
  parts.push(`**Vaše Výsosti**, dovolte mi předložiti stručnou zprávu o událostech roku **${turn}**.`);

  if (summary.battles > 0) parts.push(`V uplynulém roce došlo k **${summary.battles}** vojenským střetům, jež si vyžádaly pozornost Vaší koruny.`);
  if (summary.uprisings > 0) parts.push(`S politováním musím oznámit, že v říši vypuklo **${summary.uprisings}** lidových vzpour, které ohrožují stabilitu Vašich provincií.`);
  if (summary.buildings_completed > 0) parts.push(`Na stavební frontě bylo úspěšně dokončeno **${summary.buildings_completed}** projektů, čímž se posiluje infrastruktura říše.`);
  if (summary.active_crises > 0) parts.push(`⚠️ Naléhavě upozorňuji na **${summary.active_crises}** aktivních krizí, jež vyžadují Vaši bezodkladnou pozornost.`);
  if (summary.declarations > 0) parts.push(`V diplomatické sféře bylo zaznamenáno **${summary.declarations}** oficiálních prohlášení, jež formují mezinárodní vztahy.`);

  parts.push(`Vaše říše nyní čítá **${summary.my_cities}** měst s celkovým počtem **${summary.total_population}** obyvatel. Průměrná stabilita sídel dosahuje **${summary.avg_stability}%**.`);

  if (summary.watched_cities > 0) parts.push(`Naši zvědové rovněž přinášejí zprávy o **${summary.watched_cities}** sledovaných cizích sídlech.`);

  if (parts.length <= 2) parts.push("Rok byl ve znamení konsolidace a míru. Žádné zásadní události nenarušily klid Vaší říše.");

  parts.push("S úctou Vám oddaný, Váš hlavní rádce.");

  return parts.join("\n\n");
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
