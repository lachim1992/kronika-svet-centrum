import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, currentTurn } = await req.json();
    if (!sessionId || !playerName) throw new Error("Missing sessionId or playerName");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── Check 1×/turn limit ──
    const { data: existing } = await sb.from("council_evaluations")
      .select("id")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("round_number", currentTurn)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Rada již v tomto kole zasedala." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Gather full game state ──
    const [
      { data: cities },
      { data: resources },
      { data: armies },
      { data: factions },
      { data: tensions },
      { data: crises },
      { data: trades },
      { data: declarations },
      { data: laws },
      { data: uprisings },
      { data: cityStates },
      { data: aiFactions },
      { data: academies },
      { data: realm },
    ] = await Promise.all([
      sb.from("cities").select("*").eq("session_id", sessionId).eq("owner_player", playerName),
      sb.from("player_resources").select("*").eq("session_id", sessionId).eq("player_name", playerName),
      sb.from("military_stacks").select("*").eq("session_id", sessionId).eq("player_name", playerName),
      sb.from("city_factions").select("*").eq("session_id", sessionId).in("city_id", 
        (await sb.from("cities").select("id").eq("session_id", sessionId).eq("owner_player", playerName)).data?.map(c => c.id) || []
      ),
      sb.from("civ_tensions").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(5),
      sb.from("world_events").select("*").eq("session_id", sessionId).eq("resolved", false),
      sb.from("trade_agreements").select("*").eq("session_id", sessionId).eq("status", "active"),
      sb.from("declarations").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(10),
      sb.from("laws").select("*").eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true),
      sb.from("city_uprisings").select("*").eq("session_id", sessionId).eq("player_name", playerName).eq("status", "pending"),
      sb.from("city_states").select("*").eq("session_id", sessionId),
      sb.from("ai_factions").select("*").eq("session_id", sessionId).eq("is_active", true),
      sb.from("academies").select("*").eq("session_id", sessionId).eq("player_name", playerName),
      sb.from("realm_resources").select("sport_funding_pct, gold_reserve").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle(),
    ]);

    // ── Analyze key metrics ──
    const cityData = (cities || []).map(c => ({
      name: c.name,
      population: c.population_total,
      stability: c.city_stability,
      level: c.settlement_level,
      famine: c.famine_turn,
      famineSeverity: c.famine_severity,
      famineConsecutive: c.famine_consecutive_turns,
      epidemic: c.epidemic_active,
      status: c.status,
      grainReserve: c.local_grain_reserve,
      grainProd: c.last_turn_grain_prod,
      grainCons: c.last_turn_grain_cons,
      legitimacy: c.legitimacy,
    }));

    const factionData = (factions || []).map(f => ({
      cityId: f.city_id,
      type: f.faction_type,
      satisfaction: f.satisfaction,
      loyalty: f.loyalty,
      power: f.power,
      demand: f.current_demand,
      urgency: f.demand_urgency,
    }));

    const resourceData = (resources || []).map(r => ({
      type: r.resource_type,
      stockpile: r.stockpile,
      income: r.income,
      upkeep: r.upkeep,
    }));

    const tensionData = (tensions || []).filter(t => 
      t.player_a === playerName || t.player_b === playerName
    ).map(t => ({
      opponent: t.player_a === playerName ? t.player_b : t.player_a,
      tension: t.total_tension,
      warRisk: t.war_roll_triggered,
    }));

    const crisisData = (crises || []).map(c => ({
      title: c.title || c.crisis_type,
      severity: c.severity,
      description: c.description,
    }));

    // ── Build rich prompt ──
    const systemPrompt = `Jsi rada ministrů středověkého královského dvora. Při zasedání rady zhodnotíš CELÝ stav říše a dáš králi/královně strukturované doporučení.

Tvé role:
- Ministr obchodu (ekonomika, zdroje, obchod)
- Ministr vnitra (stabilita, frakce, povstání, hladomory)
- Vojevůdce (armáda, ohrožení, tenze)
- Diplomat (vztahy, městské státy, aliance)
- Velekněz (kultura, legitimita, morálka)

PRAVIDLA:
1. Vycházej STRIKTNĚ z poskytnutých dat — nevymýšlej čísla ani události
2. Piš česky, formálním ale srozumitelným středověkým stylem
3. Identifikuj TOP problémy a navrhni KONKRÉTNÍ dekrety k řešení
4. Každý navržený dekret musí mít typ a mechanické efekty
5. Navrhni strategický směr pro příští kolo s odůvodněním
6. Zohledni: hladomory, epidemie, nízkou spokojenost frakcí, diplomatické tenze, ekonomický deficit
7. Pokud existují akademie/arény: zhodnoť jejich stav, riziko vzpoury gladiátorů, a doporuč úpravu sportovního financování`;

    const userPrompt = `=== ZASEDÁNÍ KRÁLOVSKÉ RADY ===
Vládce: ${playerName}
Kolo: ${currentTurn}

=== MĚSTA (${cityData.length}) ===
${cityData.map(c => `- ${c.name}: pop ${c.population}, stabilita ${c.stability}, úroveň ${c.level}, status ${c.status}${c.famine ? `, HLADOMOR (závažnost ${c.famineSeverity}, ${c.famineConsecutive} kol)` : ""}${c.epidemic ? ", EPIDEMIE" : ""}, obilí: ${c.grainProd} prod / ${c.grainCons} spotř, rezerva ${c.grainReserve}, legitimita ${c.legitimacy}`).join("\n")}

=== FRAKCE ===
${factionData.map(f => {
  const city = cityData.find(c => (cities||[]).find(ci => ci.id === f.cityId)?.name === c.name);
  return `- ${f.type} (${city?.name || "?"}): spokojenost ${f.satisfaction}, loajalita ${f.loyalty}, moc ${f.power}${f.demand ? `, POŽADAVEK: "${f.demand}" (naléhavost ${f.urgency})` : ""}`;
}).join("\n")}

=== ZDROJE ===
${resourceData.map(r => `- ${r.type}: zásoba ${r.stockpile}, příjem ${r.income}, výdaje ${r.upkeep}, bilance ${(r.income||0) - (r.upkeep||0)}`).join("\n")}

=== ARMÁDA ===
Počet armád: ${(armies || []).length}
${(armies || []).slice(0, 5).map((a: any) => `- ${a.stack_name}: ${a.total_strength} síla, morálka ${a.morale}, status ${a.status}`).join("\n")}

=== DIPLOMATICKÉ TENZE ===
${tensionData.length > 0 ? tensionData.map(t => `- vs ${t.opponent}: tenze ${t.tension}${t.warRisk ? " ⚠ HROZBA VÁLKY" : ""}`).join("\n") : "Žádné významné tenze."}

=== AKTIVNÍ KRIZE ===
${crisisData.length > 0 ? crisisData.map(c => `- ${c.title}: ${c.description || ""} (závažnost: ${c.severity})`).join("\n") : "Žádné aktivní krize."}

=== POVSTÁNÍ ===
${(uprisings || []).length > 0 ? (uprisings || []).map((u: any) => `- Město ${u.city_id}: eskalace ${u.escalation_level}, požadavky: ${JSON.stringify(u.demands)}`).join("\n") : "Žádná povstání."}

=== AKTIVNÍ ZÁKONY ===
${(laws || []).map((l: any) => `- ${l.law_name}: ${JSON.stringify(l.structured_effects || [])}`).join("\n") || "Žádné."}

=== AI FRAKCE V SOUSEDSTVÍ ===
${(aiFactions || []).map((f: any) => `- ${f.faction_name}: osobnost ${f.personality}`).join("\n") || "Žádné."}

=== MĚSTSKÉ STÁTY ===
${(cityStates || []).map((cs: any) => `- ${cs.name}: typ ${cs.type}, nálada ${cs.mood}`).join("\n") || "Žádné."}

=== AKADEMIE A ARÉNY ===
${(academies || []).map((a: any) => `- ${a.name}${a.is_gladiatorial ? " [GLADIÁTORSKÁ]" : ""}: reputace ${a.reputation}, infrastruktura ${a.infrastructure}, absolventi ${a.total_graduates}, šampioni ${a.total_champions}, úmrtnost ${a.total_fatalities}${a.revolt_risk > 50 ? `, ⚠ RIZIKO VZPOURY ${a.revolt_risk}%` : ""}${a.people_favor != null ? `, lid_favor ${a.people_favor}, elita_favor ${a.elite_favor}` : ""}`).join("\n") || "Žádné akademie."}

=== SPORTOVNÍ FINANCOVÁNÍ ===
${realm ? `Podíl financování sportu: ${realm.sport_funding_pct || 0}% ze zlata (${Math.floor((realm.gold_reserve || 0) * (realm.sport_funding_pct || 0) / 100)} zlata/kolo)` : "Není nastaveno."}

Proveď kompletní zasedání rady a vrať strukturovaný výstup.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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
                      advisorRole: { type: "string", description: "Role rádce: economy, stability, military, diplomacy, culture" },
                      advisorTitle: { type: "string", description: "Titul rádce česky" },
                      summary: { type: "string", description: "Krátké shrnutí (1-2 věty)" },
                      keyIssues: { type: "array", items: { type: "string" }, description: "Klíčové problémy (1-3)" },
                      recommendation: { type: "string", description: "Doporučení (1-2 věty)" },
                    },
                    required: ["advisorRole", "advisorTitle", "summary", "recommendation"],
                  },
                },
                priorityAgenda: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "number", description: "Pořadí priority 1-3" },
                      title: { type: "string", description: "Název problému (krátký)" },
                      description: { type: "string", description: "Popis problému a proč je urgentní" },
                      suggestedDecree: {
                        type: "object",
                        properties: {
                          decreeType: { type: "string", description: "Typ: law, tax, military_reform, diplomatic_shift, religious_decree" },
                          decreeText: { type: "string", description: "Text navrženého dekretu" },
                          effects: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string", description: "Effect type: tax_change, trade_restriction, military_funding, civil_reform" },
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
                  description: "TOP 3 nejdůležitější problémy s navrženými dekrety",
                },
                strategicDirection: {
                  type: "object",
                  properties: {
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "Identifikátor: expansion, consolidation, diplomacy, militarism, prosperity" },
                          label: { type: "string", description: "Český název směru" },
                          description: { type: "string", description: "Popis co tento směr znamená (1-2 věty)" },
                          supportingAdvisors: { type: "array", items: { type: "string" }, description: "Kteří rádci podporují tento směr" },
                          effects: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                label: { type: "string" },
                                value: { type: "number" },
                              },
                            },
                            description: "Mechanické bonusy/postihy při zvolení tohoto směru",
                          },
                        },
                        required: ["id", "label", "description", "effects"],
                      },
                    },
                    recommendation: { type: "string", description: "Který směr rada doporučuje a proč (1-2 věty)" },
                  },
                  required: ["options", "recommendation"],
                },
              },
              required: ["overallAssessment", "riskLevel", "advisorReports", "priorityAgenda", "strategicDirection"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "council_session_result" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let result;

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      result = {
        overallAssessment: aiData.choices?.[0]?.message?.content || "Rada nemohla zasednout.",
        riskLevel: "Střední",
        advisorReports: [],
        priorityAgenda: [],
        strategicDirection: { options: [], recommendation: "" },
      };
    }

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

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("council-session error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
