import { createAIContext, invokeAI, getServiceClient, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, currentTurn } = await req.json();
    if (!sessionId || !playerName) throw new Error("Missing sessionId or playerName");

    const sb = getServiceClient();

    // ── Check 1×/turn limit ──
    const { data: existing } = await sb.from("council_evaluations")
      .select("id")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("round_number", currentTurn)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ error: "Rada již v tomto kole zasedala." }, 409);
    }

    // ── Load unified AI context (premise + civ identity) ──
    const aiCtx = await createAIContext(sessionId, currentTurn, sb, playerName);

    // ── Gather full game state (unified data sources) ──
    const [
      { data: cities },
      { data: realmRes },
      { data: armies },
      { data: tensions },
      { data: warDeclarations },
      { data: tradeRoutes },
      { data: declarations },
      { data: laws },
      { data: uprisings },
      { data: cityStates },
      { data: aiFactions },
      { data: academies },
      { data: cachedBriefing },
      { data: worldCrises },
    ] = await Promise.all([
      sb.from("cities").select("*").eq("session_id", sessionId).eq("owner_player", playerName),
      sb.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle(),
      sb.from("military_stacks").select("id, name, power, morale, is_deployed, formation_type")
        .eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true),
      sb.from("civ_tensions").select("player_a, player_b, total_tension, crisis_triggered")
        .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(10),
      sb.from("war_declarations").select("declaring_player, target_player, status, manifest_text")
        .eq("session_id", sessionId)
        .or(`declaring_player.eq.${playerName},target_player.eq.${playerName}`)
        .in("status", ["active", "peace_offered"]),
      sb.from("trade_routes").select("player_a, player_b, resource_type, amount, route_safety, is_active")
        .eq("session_id", sessionId).eq("is_active", true)
        .or(`player_a.eq.${playerName},player_b.eq.${playerName}`),
      sb.from("declarations").select("player_name, declaration_type, original_text, turn_number")
        .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(10),
      sb.from("laws").select("law_name, structured_effects, is_active")
        .eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true),
      sb.from("city_uprisings").select("city_id, escalation_level, demands, status")
        .eq("session_id", sessionId).eq("player_name", playerName).eq("status", "pending"),
      sb.from("city_states").select("name, type, mood").eq("session_id", sessionId),
      sb.from("ai_factions").select("faction_name, personality").eq("session_id", sessionId).eq("is_active", true),
      sb.from("academies").select("name, is_gladiatorial, reputation, infrastructure, total_graduates, total_champions, total_fatalities, revolt_risk, people_favor, elite_favor")
        .eq("session_id", sessionId).eq("player_name", playerName),
      sb.from("turn_briefings").select("briefing_text").eq("session_id", sessionId).eq("player_name", playerName).eq("turn_number", currentTurn - 1).maybeSingle(),
      sb.from("world_events").select("title, severity, description").eq("session_id", sessionId).eq("resolved", false),
    ]);

    // Fetch city factions for player's cities
    const cityIds = (cities || []).map((c: any) => c.id);
    let factions: any[] = [];
    if (cityIds.length > 0) {
      const { data: f } = await sb.from("city_factions").select("city_id, faction_type, satisfaction, loyalty, power, current_demand, demand_urgency")
        .eq("session_id", sessionId).in("city_id", cityIds);
      factions = f || [];
    }

    // ── Serialize data ──
    const cityData = (cities || []).map((c: any) => ({
      name: c.name, population: c.population_total, stability: c.city_stability,
      level: c.settlement_level, famine: c.famine_turn, famineSeverity: c.famine_severity,
      famineConsecutive: c.famine_consecutive_turns, epidemic: c.epidemic_active,
      status: c.status, grainReserve: c.local_grain_reserve,
      grainProd: c.last_turn_grain_prod, grainCons: c.last_turn_grain_cons, legitimacy: c.legitimacy,
    }));

    const tensionFiltered = (tensions || []).filter((t: any) =>
      t.player_a === playerName || t.player_b === playerName
    ).map((t: any) => ({
      opponent: t.player_a === playerName ? t.player_b : t.player_a,
      tension: t.total_tension, crisis: t.crisis_triggered,
    }));

    // ── Build domain-specific prompt (premise is auto-injected by invokeAI) ──
    const systemPrompt = `Jsi rada ministrů středověkého královského dvora. Zhodnotíš CELÝ stav říše a dáš strukturované doporučení.

Tvé role: Ministr obchodu, Ministr vnitra, Vojevůdce, Diplomat, Velekněz.

PRAVIDLA:
1. Vycházej STRIKTNĚ z poskytnutých dat — nevymýšlej čísla ani události.
2. Identifikuj TOP problémy a navrhni KONKRÉTNÍ dekrety k řešení.
3. Zohledni: hladomory, epidemie, nízkou spokojenost frakcí, diplomatické tenze, ekonomický deficit.
4. Nesmíš vymýšlet nové události — pouze interpretuj dodaná data.`;

    const userPrompt = `=== ZASEDÁNÍ KRÁLOVSKÉ RADY ===
Vládce: ${playerName}
Kolo: ${currentTurn}
${cachedBriefing?.briefing_text ? `\n=== HLÁŠENÍ RÁDCŮ Z MINULÉHO KOLA ===\n${cachedBriefing.briefing_text}\n` : ""}
=== MĚSTA (${cityData.length}) ===
${cityData.map(c => `- ${c.name}: pop ${c.population}, stabilita ${c.stability}, úroveň ${c.level}, status ${c.status}${c.famine ? `, HLADOMOR (závažnost ${c.famineSeverity}, ${c.famineConsecutive} kol)` : ""}${c.epidemic ? ", EPIDEMIE" : ""}, obilí: ${c.grainProd} prod / ${c.grainCons} spotř, rezerva ${c.grainReserve}, legitimita ${c.legitimacy}`).join("\n")}

=== FRAKCE ===
${factions.map(f => {
  const city = (cities || []).find((c: any) => c.id === f.city_id);
  return `- ${f.faction_type} (${city?.name || "?"}): spokojenost ${f.satisfaction}, loajalita ${f.loyalty}, moc ${f.power}${f.current_demand ? `, POŽADAVEK: "${f.current_demand}" (naléhavost ${f.demand_urgency})` : ""}`;
}).join("\n")}

=== ZDROJE ===
Zlato: ${realmRes?.gold_reserve || 0}, Obilí: ${realmRes?.grain_reserve || 0}, Dřevo: ${realmRes?.wood_reserve || 0}, Kámen: ${realmRes?.stone_reserve || 0}, Železo: ${realmRes?.iron_reserve || 0}
Manpower: ${realmRes?.manpower_pool || 0}, Mobilizace: ${((realmRes?.mobilization_rate || 0.1) * 100).toFixed(0)}%

=== ARMÁDA (${(armies || []).length}) ===
${(armies || []).slice(0, 8).map((a: any) => `- ${a.name}: síla ${a.power}, morálka ${a.morale}, ${a.is_deployed ? "nasazena" : "garnizón"}`).join("\n") || "Žádné."}

=== AKTIVNÍ VÁLKY ===
${(warDeclarations || []).filter((w: any) => w.status === "active").map((w: any) => `- ${w.declaring_player} vs ${w.target_player}`).join("\n") || "Žádné."}

=== OBCHODNÍ TRASY ===
${(tradeRoutes || []).map((tr: any) => `- ${tr.player_a} ⟷ ${tr.player_b}: ${tr.resource_type} (${tr.amount})`).join("\n") || "Žádné."}

=== DIPLOMATICKÉ TENZE ===
${tensionFiltered.length > 0 ? tensionFiltered.map(t => `- vs ${t.opponent}: tenze ${t.tension}${t.crisis ? " ⚠ KRIZE" : ""}`).join("\n") : "Žádné významné tenze."}

=== AKTIVNÍ KRIZE ===
${(worldCrises || []).map((c: any) => `- ${c.title}: ${c.description || ""} (závažnost: ${c.severity})`).join("\n") || "Žádné."}

=== POVSTÁNÍ ===
${(uprisings || []).map((u: any) => `- Město ${u.city_id}: eskalace ${u.escalation_level}, požadavky: ${JSON.stringify(u.demands)}`).join("\n") || "Žádná."}

=== AKTIVNÍ ZÁKONY ===
${(laws || []).map((l: any) => `- ${l.law_name}: ${JSON.stringify(l.structured_effects || [])}`).join("\n") || "Žádné."}

=== AI FRAKCE ===
${(aiFactions || []).map((f: any) => `- ${f.faction_name}: osobnost ${f.personality}`).join("\n") || "Žádné."}

=== MĚSTSKÉ STÁTY ===
${(cityStates || []).map((cs: any) => `- ${cs.name}: typ ${cs.type}, nálada ${cs.mood}`).join("\n") || "Žádné."}

=== AKADEMIE A ARÉNY ===
${(academies || []).map((a: any) => `- ${a.name}${a.is_gladiatorial ? " [GLADIÁTORSKÁ]" : ""}: reputace ${a.reputation}, infrastruktura ${a.infrastructure}${a.revolt_risk > 50 ? `, ⚠ RIZIKO VZPOURY ${a.revolt_risk}%` : ""}`).join("\n") || "Žádné."}

=== SPORTOVNÍ FINANCOVÁNÍ ===
${realmRes ? `${realmRes.sport_funding_pct || 0}% ze zlata` : "Není nastaveno."}

Proveď kompletní zasedání rady a vrať strukturovaný výstup.`;

    const aiResult = await invokeAI(aiCtx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "council_session_result",
          description: "Return the full council session results",
          parameters: {
            type: "object",
            properties: {
              overallAssessment: { type: "string", description: "Celkové zhodnocení stavu říše (2-3 věty, česky)" },
              riskLevel: { type: "string", description: "Celková úroveň rizika: Nízké, Střední, Vysoké, Kritické" },
              advisorReports: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    advisorRole: { type: "string", description: "Role: economy, stability, military, diplomacy, culture" },
                    advisorTitle: { type: "string" },
                    summary: { type: "string" },
                    keyIssues: { type: "array", items: { type: "string" } },
                    recommendation: { type: "string" },
                  },
                  required: ["advisorRole", "advisorTitle", "summary", "recommendation"],
                },
              },
              priorityAgenda: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    priority: { type: "number" },
                    title: { type: "string" },
                    description: { type: "string" },
                    suggestedDecree: {
                      type: "object",
                      properties: {
                        decreeType: { type: "string" },
                        decreeText: { type: "string" },
                        effects: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string" },
                              value: { type: "number" },
                              label: { type: "string" },
                            },
                            required: ["type", "value", "label"],
                          },
                        },
                      },
                      required: ["decreeType", "decreeText", "effects"],
                    },
                  },
                  required: ["priority", "title", "description", "suggestedDecree"],
                },
              },
              strategicDirection: {
                type: "object",
                properties: {
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        label: { type: "string" },
                        description: { type: "string" },
                        supportingAdvisors: { type: "array", items: { type: "string" } },
                        effects: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { label: { type: "string" }, value: { type: "number" } },
                          },
                        },
                      },
                      required: ["id", "label", "description", "effects"],
                    },
                  },
                  recommendation: { type: "string" },
                },
                required: ["options", "recommendation"],
              },
            },
            required: ["overallAssessment", "riskLevel", "advisorReports", "priorityAgenda", "strategicDirection"],
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "council_session_result" } },
    });

    if (!aiResult.ok) {
      if (aiResult.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
      if (aiResult.status === 402) return jsonResponse({ error: "Credits exhausted" }, 402);
      throw new Error(aiResult.error || "AI error");
    }

    const result = aiResult.data || {
      overallAssessment: "Rada nemohla zasednout.",
      riskLevel: "Střední",
      advisorReports: [],
      priorityAgenda: [],
      strategicDirection: { options: [], recommendation: "" },
    };

    // ── Persist to council_evaluations ──
    await sb.from("council_evaluations").insert({
      session_id: sessionId,
      player_name: playerName,
      round_number: currentTurn,
      round_summary: result.overallAssessment,
      strategic_outlook: result.strategicDirection?.recommendation || null,
      minister_trade: result.advisorReports?.find((r: any) => r.advisorRole === "economy")?.summary || null,
      minister_interior: result.advisorReports?.find((r: any) => r.advisorRole === "stability")?.summary || null,
      minister_war: result.advisorReports?.find((r: any) => r.advisorRole === "military")?.summary || null,
      minister_diplomacy: result.advisorReports?.find((r: any) => r.advisorRole === "diplomacy")?.summary || null,
    });

    return jsonResponse(result);
  } catch (e) {
    console.error("council-session error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});