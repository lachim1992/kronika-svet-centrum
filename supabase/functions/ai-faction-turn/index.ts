/**
 * ai-faction-turn: Enhanced AI faction decision-making.
 *
 * Situational AI that:
 * - Reads full economic state (realm_resources, cities, buildings)
 * - Reads diplomatic context (diplomacy_messages, war_declarations, tensions)
 * - Reads military state (military_stacks, battles)
 * - Decides actions: build, recruit, diplomacy, war, peace, threats
 * - Executes via existing infrastructure (command-dispatch, direct DB)
 * - Must send ultimatum before declaring war
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, factionName } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "API key not configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Fetch faction ──
    const { data: faction } = await supabase.from("ai_factions")
      .select("*").eq("session_id", sessionId)
      .eq("faction_name", factionName).eq("is_active", true).single();
    if (!faction) return json({ error: "Faction not found or inactive" }, 404);

    // ── Fetch session ──
    const { data: session } = await supabase.from("game_sessions")
      .select("current_turn, epoch_style").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const turn = session.current_turn;

    // ── Parallel data fetch ──
    const [
      { data: cities },
      { data: realmRes },
      { data: stacks },
      { data: recentEvents },
      { data: worldSummary },
      { data: influenceData },
      { data: tensionData },
      { data: warDeclarations },
      { data: diplomacyRooms },
      { data: civ },
      { data: buildingTemplates },
    ] = await Promise.all([
      supabase.from("cities").select("id, name, level, status, population_total, city_stability, settlement_level, military_garrison")
        .eq("session_id", sessionId).eq("owner_player", factionName),
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", factionName).maybeSingle(),
      supabase.from("military_stacks").select("id, name, formation_type, morale, power, is_deployed, player_name")
        .eq("session_id", sessionId).eq("player_name", factionName).eq("is_active", true),
      supabase.from("game_events").select("event_type, player, turn_number, note, result, location")
        .eq("session_id", sessionId).eq("confirmed", true)
        .gte("turn_number", Math.max(1, turn - 3)).order("turn_number", { ascending: false }).limit(20),
      supabase.from("ai_world_summaries").select("summary_text, key_facts")
        .eq("session_id", sessionId).eq("summary_type", "world_state")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("civ_influence")
        .select("player_name, total_influence, military_score, trade_score, diplomatic_score")
        .eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(10),
      supabase.from("civ_tensions")
        .select("player_a, player_b, total_tension, crisis_triggered")
        .eq("session_id", sessionId)
        .or(`player_a.eq.${factionName},player_b.eq.${factionName}`)
        .order("turn_number", { ascending: false }).limit(10),
      supabase.from("war_declarations").select("*")
        .eq("session_id", sessionId)
        .or(`declaring_player.eq.${factionName},target_player.eq.${factionName}`)
        .in("status", ["active", "peace_offered"]),
      supabase.from("diplomacy_rooms").select("id, participant_a, participant_b")
        .eq("session_id", sessionId)
        .or(`participant_a.eq.${factionName},participant_b.eq.${factionName}`),
      supabase.from("civilizations").select("civ_bonuses, core_myth, cultural_quirk, architectural_style")
        .eq("session_id", sessionId).eq("player_name", factionName).maybeSingle(),
      supabase.from("building_templates").select("name, category, cost_wood, cost_stone, cost_iron, cost_wealth, required_settlement_level")
        .limit(20),
    ]);

    // Fetch recent diplomacy messages for all rooms involving this faction
    const roomIds = (diplomacyRooms || []).map((r: any) => r.id);
    let recentMessages: any[] = [];
    if (roomIds.length > 0) {
      const { data: msgs } = await supabase.from("diplomacy_messages")
        .select("sender, message_text, room_id, created_at")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false }).limit(15);
      recentMessages = msgs || [];
    }

    // Check if AI already sent an ultimatum recently (for war prerequisite)
    const sentUltimatums = recentMessages.filter((m: any) =>
      m.sender === factionName && m.message_text?.includes("[ULTIMÁTUM]")
    );

    // ── Build context for AI ──
    const resources = {
      gold: realmRes?.gold_reserve || 0,
      grain: realmRes?.grain_reserve || 0,
      wood: realmRes?.wood_reserve || 0,
      stone: realmRes?.stone_reserve || 0,
      iron: realmRes?.iron_reserve || 0,
      manpower: realmRes?.manpower_pool || 0,
    };

    const activeWars = (warDeclarations || []).filter((w: any) => w.status === "active");
    const peaceOffers = (warDeclarations || []).filter((w: any) => w.status === "peace_offered");

    // Affordable buildings
    const affordableBuildings = (buildingTemplates || []).filter((t: any) =>
      t.cost_wood <= resources.wood && t.cost_stone <= resources.stone &&
      t.cost_iron <= resources.iron && t.cost_wealth <= resources.gold
    ).map((t: any) => t.name).slice(0, 8);

    const personality = faction.personality || "diplomatic";
    const goals = faction.goals || [];

    const systemPrompt = `Jsi AI řídící frakci "${factionName}" v civilizační strategické hře.

OSOBNOST: ${personality}
MÝTUS: ${civ?.core_myth || "neznámý"}
KULTURNÍ ZVLÁŠTNOST: ${civ?.cultural_quirk || "žádná"}
CÍLE: ${JSON.stringify(goals)}
POSTOJ K HRÁČI: ${JSON.stringify(faction.disposition)}

PRAVIDLA ROZHODOVÁNÍ:
1. EKONOMIE: Rozhoduj na základě aktuálních zdrojů. Nestavěj/neverbuj bez zdrojů.
2. DIPLOMACIE: Vyhrožuj, nabízej smír, komunikuj — vše skrze diplomatické zprávy.
3. VÁLKA: PŘED vyhlášením války MUSÍŠ nejdřív poslat ultimátum (send_ultimatum). Válku můžeš vyhlásit až v DALŠÍM kole po ultimátu.
4. MÍR: Pokud válka trvá a jsi v nevýhodě, nabídni mír. Pokud jsi silný, požaduj podmínky.
5. ARMÁDA: Verbuj vojsko úměrně hrozbám a zdrojům.
6. STAVBY: Stavěj budovy které odpovídají tvé situaci (obrana při válce, ekonomika v míru).
7. Max 4 akce za kolo.
8. Odpovídej ČESKY. Diplomatické zprávy piš v dobovém středověkém tónu odpovídajícím tvé osobnosti.
9. Nesmíš měnit číselné hodnoty — pouze rozhoduj o akcích.

OSOBNOSTNÍ VZORCE:
- aggressive: Přímé hrozby, časté verbování, rychlá eskalace
- diplomatic: Preferuje jednání, kompromisy, mírová řešení
- mercantile: Obchod, ekonomický růst, stavby, obchodní dohody
- isolationist: Opatrnost, fortifikace, minimální interakce
- expansionist: Územní růst, kolonizace, strategická válka`;

    const userPrompt = `ROK: ${turn}

EKONOMIKA FRAKCE:
Zlato: ${resources.gold}, Obilí: ${resources.grain}, Dřevo: ${resources.wood}, Kámen: ${resources.stone}, Železo: ${resources.iron}, Lidská síla: ${resources.manpower}

MĚSTA (${(cities || []).length}):
${JSON.stringify((cities || []).map((c: any) => ({ name: c.name, pop: c.population_total, stabilita: c.city_stability, úroveň: c.settlement_level, garnizona: c.military_garrison })), null, 2)}

ARMÁDA (${(stacks || []).length} jednotek):
${JSON.stringify((stacks || []).map((s: any) => ({ name: s.name, síla: s.power, morálka: s.morale, nasazena: s.is_deployed })), null, 2)}

DOSTUPNÉ STAVBY: ${affordableBuildings.join(", ") || "žádné (nedostatek zdrojů)"}

VLIV CIVILIZACÍ:
${JSON.stringify(influenceData || [], null, 2)}

NAPĚTÍ S OSTATNÍMI:
${JSON.stringify(tensionData || [], null, 2)}

AKTIVNÍ VÁLKY: ${activeWars.length > 0 ? JSON.stringify(activeWars.map((w: any) => ({ s: w.declaring_player, cíl: w.target_player, od_kola: w.declared_turn }))) : "žádné"}
NABÍDKY MÍRU: ${peaceOffers.length > 0 ? JSON.stringify(peaceOffers.map((w: any) => ({ nabídl: w.peace_offered_by, podmínky: w.peace_conditions }))) : "žádné"}

ODESLANÁ ULTIMÁTA: ${sentUltimatums.length > 0 ? "ANO (můžeš vyhlásit válku)" : "NE (musíš nejdřív poslat ultimátum)"}

POSLEDNÍ DIPLOMATICKÉ ZPRÁVY:
${recentMessages.slice(0, 10).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n") || "žádné"}

NEDÁVNÉ UDÁLOSTI:
${JSON.stringify((recentEvents || []).slice(0, 10), null, 2)}

STAV SVĚTA: ${worldSummary?.summary_text || "Žádný souhrn"}

Rozhodni, co frakce udělá v tomto kole. Buď strategický a situační.`;

    // ── Call AI ──
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "faction_turn",
            description: "Submit faction decisions for this turn.",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      actionType: {
                        type: "string",
                        enum: [
                          "build_building",
                          "recruit_army",
                          "send_diplomacy_message",
                          "send_ultimatum",
                          "declare_war",
                          "offer_peace",
                          "accept_peace",
                          "issue_declaration",
                          "trade",
                          "explore",
                        ],
                      },
                      description: { type: "string", description: "Stručný popis akce" },
                      targetPlayer: { type: "string", description: "Cílový hráč/frakce (pro diplomatické akce)" },
                      targetCity: { type: "string", description: "Cílové město (pro stavby)" },
                      buildingName: { type: "string", description: "Název budovy ze seznamu dostupných" },
                      armyName: { type: "string", description: "Název nové armády" },
                      armyPreset: { type: "string", enum: ["patrol", "warband", "legion", "siege_company"], description: "Typ armády" },
                      messageText: { type: "string", description: "Text diplomatické zprávy / ultimáta / prohlášení" },
                      peaceConditions: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["white_peace", "tribute", "territory", "vassalage"] },
                          tributeAmount: { type: "number" },
                          territoryName: { type: "string" },
                        },
                      },
                      narrativeNote: { type: "string", description: "Krátký narativní text pro kroniku" },
                    },
                    required: ["actionType", "description"],
                  },
                },
                dispositionChanges: {
                  type: "object",
                  description: "Změny postoje k hráčům: { jménoHráče: delta (-20 až +20) }",
                },
                internalThought: { type: "string", description: "Interní úvaha AI (pro debug/narativ)" },
              },
              required: ["actions", "internalThought"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "faction_turn" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit" }, 429);
      if (response.status === 402) return json({ error: "Credits exhausted" }, 402);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const result = JSON.parse(toolCall.function.arguments);
    const executedActions: any[] = [];

    // ── Execute each action ──
    for (const action of (result.actions || []).slice(0, 4)) {
      try {
        const executed = await executeAction(supabase, supabaseUrl, supabaseKey, sessionId, turn, factionName, action, faction, sentUltimatums.length > 0);
        executedActions.push({ ...action, executed: true, result: executed });
      } catch (err) {
        console.error(`Action ${action.actionType} failed:`, err);
        executedActions.push({ ...action, executed: false, error: (err as Error).message });
      }
    }

    // ── Update disposition ──
    if (result.dispositionChanges && typeof result.dispositionChanges === "object") {
      const newDisposition = { ...faction.disposition };
      for (const [target, delta] of Object.entries(result.dispositionChanges)) {
        const d = Number(delta) || 0;
        const clamped = Math.max(-20, Math.min(20, d));
        newDisposition[target] = Math.max(-100, Math.min(100, ((newDisposition[target] as number) || 0) + clamped));
      }
      await supabase.from("ai_factions").update({ disposition: newDisposition }).eq("id", faction.id);
    }

    // ── Audit log ──
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: factionName,
      turn_number: turn,
      action_type: "ai_faction_turn",
      description: `AI frakce ${factionName}: ${executedActions.filter(a => a.executed).length}/${executedActions.length} akcí. ${result.internalThought || ""}`,
    }).then(() => {}, () => {});

    // ── Process economy for AI faction ──
    try {
      await supabase.functions.invoke("process-turn", {
        body: { sessionId, playerName: factionName },
      });
    } catch (ptErr) {
      console.warn("process-turn for AI faction failed:", ptErr);
    }

    return json({
      faction: factionName,
      actionsCount: executedActions.filter(a => a.executed).length,
      actions: executedActions,
      internalThought: result.internalThought,
    });
  } catch (e) {
    console.error("ai-faction-turn error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ═══════════════════════════════════════════
// ACTION EXECUTOR
// ═══════════════════════════════════════════

async function executeAction(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  sessionId: string,
  turn: number,
  factionName: string,
  action: any,
  faction: any,
  hasUltimatum: boolean,
): Promise<string> {
  const commandId = crypto.randomUUID();

  switch (action.actionType) {
    // ─── BUILD BUILDING ───
    case "build_building": {
      if (!action.buildingName || !action.targetCity) return "missing_params";
      // Find template
      const { data: tmpl } = await supabase.from("building_templates")
        .select("*").ilike("name", action.buildingName).limit(1).maybeSingle();
      if (!tmpl) return "template_not_found";
      // Find city
      const { data: city } = await supabase.from("cities")
        .select("id, name").eq("session_id", sessionId)
        .eq("owner_player", factionName).ilike("name", action.targetCity).limit(1).maybeSingle();
      if (!city) return "city_not_found";

      // Call command-dispatch
      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "BUILD_BUILDING",
        commandPayload: {
          cityId: city.id, cityName: city.name,
          buildingName: tmpl.name, templateId: tmpl.id,
          note: action.description,
          chronicleText: action.narrativeNote || `Frakce ${factionName} zahájila stavbu ${tmpl.name} v ${city.name}.`,
        },
        commandId,
      });
      return "ok";
    }

    // ─── RECRUIT ARMY ───
    case "recruit_army": {
      const preset = action.armyPreset || "warband";
      const name = action.armyName || `${factionName} ${preset} ${turn}`;
      await invokeFunction(supabaseUrl, supabaseKey, "command-dispatch", {
        sessionId, turnNumber: turn,
        actor: { name: factionName, type: "ai_faction" },
        commandType: "RECRUIT_STACK",
        commandPayload: {
          stackName: name, presetKey: preset,
          note: action.description,
          chronicleText: action.narrativeNote || `${factionName} verbuje novou armádu: ${name}.`,
        },
        commandId,
      });
      return "ok";
    }

    // ─── SEND DIPLOMACY MESSAGE ───
    case "send_diplomacy_message": {
      if (!action.targetPlayer || !action.messageText) return "missing_params";
      return await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, action.messageText);
    }

    // ─── SEND ULTIMATUM (prerequisite for war) ───
    case "send_ultimatum": {
      if (!action.targetPlayer) return "missing_target";
      const text = `[ULTIMÁTUM] ${action.messageText || `Frakce ${factionName} žádá podřízení se jejím podmínkám. Neuposlechnutí bude znamenat válku.`}`;
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, text);
      // Also issue as public declaration
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "ultimatum",
        original_text: text, tone: "Threatening",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});
      return "ok";
    }

    // ─── DECLARE WAR ───
    case "declare_war": {
      if (!action.targetPlayer) return "missing_target";
      if (!hasUltimatum) return "ultimatum_required_first";

      // Check no active war already
      const { data: existing } = await supabase.from("war_declarations")
        .select("id").eq("session_id", sessionId).eq("status", "active")
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (existing) return "war_already_active";

      // Create war declaration
      const manifest = action.messageText || `Frakce ${factionName} vyhlašuje válku!`;
      await supabase.from("war_declarations").insert({
        session_id: sessionId, declaring_player: factionName,
        target_player: action.targetPlayer, status: "active",
        manifest_text: manifest, declared_turn: turn,
        stability_penalty_applied: true,
      });

      // Apply stability penalties
      const { data: attackerCities } = await supabase.from("cities")
        .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", factionName);
      for (const c of (attackerCities || [])) {
        await supabase.from("cities").update({ city_stability: Math.max(0, (c.city_stability || 50) - 5) }).eq("id", c.id);
      }
      const { data: defenderCities } = await supabase.from("cities")
        .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", action.targetPlayer);
      for (const c of (defenderCities || [])) {
        await supabase.from("cities").update({ city_stability: Math.max(0, (c.city_stability || 50) - 8) }).eq("id", c.id);
      }

      // Game event + declaration
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "war", player: factionName,
        turn_number: turn, confirmed: true, note: manifest,
        importance: "critical", truth_state: "canon", actor_type: "ai_faction",
        reference: { targetPlayer: action.targetPlayer },
      }).then(() => {}, () => {});

      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "war_declaration",
        original_text: manifest, tone: "Threatening",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── OFFER PEACE ───
    case "offer_peace": {
      if (!action.targetPlayer) return "missing_target";
      const { data: war } = await supabase.from("war_declarations")
        .select("*").eq("session_id", sessionId).eq("status", "active")
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (!war) return "no_active_war";

      const conditions = action.peaceConditions || { type: "white_peace" };
      await supabase.from("war_declarations").update({
        status: "peace_offered",
        peace_offered_by: factionName,
        peace_offer_text: action.messageText || `${factionName} nabízí mír.`,
        peace_conditions: conditions,
      }).eq("id", war.id);

      // Send as diplomacy message
      const peaceMsg = action.messageText || `Nabízíme mír. Podmínky: ${conditions.type}.`;
      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer, `[MÍROVÁ NABÍDKA] ${peaceMsg}`);

      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "peace_offer",
        original_text: peaceMsg, tone: "Neutral",
        target_empire_ids: [action.targetPlayer], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── ACCEPT PEACE ───
    case "accept_peace": {
      if (!action.targetPlayer) return "missing_target";
      const { data: offer } = await supabase.from("war_declarations")
        .select("*").eq("session_id", sessionId).eq("status", "peace_offered")
        .eq("peace_offered_by", action.targetPlayer)
        .or(`and(declaring_player.eq.${factionName},target_player.eq.${action.targetPlayer}),and(declaring_player.eq.${action.targetPlayer},target_player.eq.${factionName})`)
        .maybeSingle();
      if (!offer) return "no_peace_offer";

      await supabase.from("war_declarations").update({
        status: "peace_accepted", ended_turn: turn,
      }).eq("id", offer.id);

      await sendDiplomacyMessage(supabase, sessionId, factionName, action.targetPlayer,
        `[MÍR PŘIJAT] ${factionName} přijímá mírovou nabídku.`);

      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "treaty", player: factionName,
        turn_number: turn, confirmed: true,
        note: `Mír uzavřen mezi ${factionName} a ${action.targetPlayer}.`,
        importance: "critical", truth_state: "canon", actor_type: "ai_faction",
        treaty_type: "peace", terms_summary: JSON.stringify(offer.peace_conditions),
      }).then(() => {}, () => {});

      return "ok";
    }

    // ─── ISSUE DECLARATION ───
    case "issue_declaration": {
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName,
        turn_number: turn, declaration_type: "proclamation",
        original_text: action.messageText || action.description,
        tone: "Neutral", visibility: "PUBLIC",
        status: "published", ai_generated: true,
        target_empire_ids: action.targetPlayer ? [action.targetPlayer] : [],
      }).then(() => {}, () => {});
      return "ok";
    }

    // ─── TRADE / EXPLORE (legacy) ───
    case "trade":
    case "explore":
    default: {
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: action.actionType || "other",
        player: factionName, turn_number: turn, confirmed: true,
        note: action.description, location: action.targetCity || null,
        result: action.narrativeNote || null,
        importance: "normal", truth_state: "canon", actor_type: "ai_faction",
      }).then(() => {}, () => {});
      return "ok";
    }
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

async function sendDiplomacyMessage(
  supabase: any, sessionId: string, sender: string, target: string, text: string,
): Promise<string> {
  // Find or create room
  const { data: room } = await supabase.from("diplomacy_rooms")
    .select("id").eq("session_id", sessionId)
    .or(`and(participant_a.eq.${sender},participant_b.eq.${target}),and(participant_a.eq.${target},participant_b.eq.${sender})`)
    .maybeSingle();

  let roomId = room?.id;
  if (!roomId) {
    const { data: newRoom } = await supabase.from("diplomacy_rooms").insert({
      session_id: sessionId, participant_a: sender, participant_b: target,
      room_type: "ai_faction",
    }).select("id").single();
    roomId = newRoom?.id;
  }
  if (!roomId) return "room_creation_failed";

  await supabase.from("diplomacy_messages").insert({
    room_id: roomId, sender, sender_type: "ai_faction",
    message_text: text, secrecy: "PRIVATE",
  });
  return "ok";
}

async function invokeFunction(
  supabaseUrl: string, supabaseKey: string, funcName: string, body: any,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${funcName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${funcName} failed (${res.status}): ${text}`);
  }
  return res.json();
}
