import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/**
 * diplomacy-reply: AI faction / city-state responds to player messages.
 *
 * Enhanced: AI now triggers CONCRETE diplomatic consequences based on
 * conversation content and faction personality:
 * - aggressive + insulted → ultimatum / war declaration
 * - diplomatic + pleased → trade offer / alliance proposal
 * - mercantile + opportunity → trade deal
 * - isolationist + threatened → defensive posture / warning
 * - Any + high tension → escalation
 * - Any + peace talk → peace offer
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { npc, recentMessages, recentConfirmedEvents, worldFacts, sessionId, aiFaction } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        replyText: `${npc?.name || aiFaction?.faction_name || "Diplomat"} pokyne hlavou a praví: "Vaše slova jsme vyslechli."`,
        suggestedActionEvent: null,
        actionsTaken: [],
        debug: { provider: "fallback-no-session" },
      });
    }

    const ctx = await createAIContext(sessionId);

    // ── AI FACTION DIPLOMACY (with consequences) ──
    if (aiFaction) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Parallel context fetch
      const [
        { data: faction },
        { data: civ },
        { data: tensions },
        { data: warDeclarations },
        { data: realmRes },
        { data: stacks },
        { data: session },
      ] = await Promise.all([
        supabase.from("ai_factions").select("*")
          .eq("session_id", sessionId).eq("faction_name", aiFaction.faction_name).single(),
        supabase.from("civilizations").select("*")
          .eq("session_id", sessionId).eq("player_name", aiFaction.faction_name).single(),
        supabase.from("civ_tensions").select("total_tension, player_a, player_b")
          .eq("session_id", sessionId)
          .or(`player_a.eq.${aiFaction.faction_name},player_b.eq.${aiFaction.faction_name}`)
          .order("turn_number", { ascending: false }).limit(1),
        supabase.from("war_declarations").select("*")
          .eq("session_id", sessionId)
          .or(`declaring_player.eq.${aiFaction.faction_name},target_player.eq.${aiFaction.faction_name}`)
          .in("status", ["active", "peace_offered"]),
        supabase.from("realm_resources").select("gold_reserve, grain_reserve")
          .eq("session_id", sessionId).eq("player_name", aiFaction.faction_name).maybeSingle(),
        supabase.from("military_stacks").select("id, power")
          .eq("session_id", sessionId).eq("player_name", aiFaction.faction_name).eq("is_active", true),
        supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single(),
      ]);

      const tension = tensions?.[0]?.total_tension || 0;
      const disposition = faction?.disposition || {};
      const personality = faction?.personality || "diplomatic";
      const goals = faction?.goals || [];
      const turn = session?.current_turn || 1;

      const activeWars = (warDeclarations || []).filter((w: any) => w.status === "active");
      const peaceOffers = (warDeclarations || []).filter((w: any) => w.status === "peace_offered");
      const totalMilitary = (stacks || []).reduce((s: number, st: any) => s + (st.power || 0), 0);

      // Determine who the player is from recent messages
      const playerName = (recentMessages || []).find((m: any) => m.sender !== aiFaction.faction_name)?.sender || "Hráč";

      const systemPrompt = `Jsi vládce frakce "${aiFaction.faction_name}" v civilizační strategické hře.
Osobnost: ${personality}
Mýtus: ${civ?.core_myth || "neznámý"}
Kulturní zvláštnost: ${civ?.cultural_quirk || "žádná"}
Architektonický styl: ${civ?.architectural_style || "standardní"}
Postoj k hráči ${playerName}: ${JSON.stringify(disposition)}
Cíle: ${JSON.stringify(goals)}
Tenze s hráčem: ${tension}
Vojenská síla: ${totalMilitary}
Zlato: ${realmRes?.gold_reserve || 0}
Aktivní války: ${activeWars.length > 0 ? activeWars.map((w: any) => `vs ${w.declaring_player === aiFaction.faction_name ? w.target_player : w.declaring_player}`).join(", ") : "žádné"}
Mírové nabídky: ${peaceOffers.length > 0 ? "ano" : "ne"}

PRAVIDLA:
- Odpovídej ČESKY ve středověkém diplomatickém tónu.
- Max 4 věty.
- Reaguj na obsah posledních zpráv.
- MUSÍŠ vyhodnotit sentiment hráčovy zprávy a reagovat AKCÍ:

OSOBNOSTNÍ REAKCE:
aggressive:
  - urážka/provokace → send_ultimatum (a disposition -15 až -20)
  - neutrální → demanding_tone, požaduj tribut (disposition -5)
  - lichotka/nabídka → opatrný souhlas (disposition +5)
  - opakované urážky + vysoká tenze → declare_war

diplomatic:
  - urážka → klidná výtka (disposition -5 až -10)
  - neutrální → nabídka kompromisu (disposition +3)
  - přátelská zpráva → offer_trade nebo offer_alliance (disposition +10)

mercantile:
  - jakákoli zpráva o obchodu → offer_trade (disposition +5 až +10)
  - urážka → obchodní embargo, hrozba (disposition -10)
  - neutrální → obchodní propozice (disposition +3)

isolationist:
  - jakýkoli nátlak → odměřené odmítnutí (disposition -5)
  - respektující tón → opatrné otevření (disposition +3)
  - urážka → varování, stažení (disposition -10)

expansionist:
  - slabost protivníka → hrozba expanze (disposition -5)
  - nabídka spolupráce → zájem o území (disposition +5)
  - urážka → eskalace, ultimátum (disposition -15)

DŮLEŽITÉ:
- Pokud tenze > 70 a jsi aggressive/expansionist, eskaluj k ultimátu nebo válce.
- Pokud probíhá válka a hráč prosí o mír, zvažte offer_peace.
- Pokud probíhá mírová nabídka, můžeš ji přijmout (accept_peace) nebo odmítnout.
- Nikdy nevymýšlej číselné výsledky nebo herní události mimo diplomatické akce.
- Voláš funkci diplomatic_response s textem I akcí.`;

      const userPrompt = `Kontext světa: ${JSON.stringify(worldFacts?.slice(0, 8) || [])}
Nedávné události: ${JSON.stringify(recentConfirmedEvents?.slice(0, 5) || [])}
Poslední zprávy:
${(recentMessages || []).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n")}

Odpověz jako vládce frakce ${aiFaction.faction_name} a vyber diplomatickou akci.`;

      const result = await invokeAI(ctx, {
        systemPrompt,
        userPrompt,
        tools: [{
          type: "function",
          function: {
            name: "diplomatic_response",
            description: "Respond to player and optionally take diplomatic action.",
            parameters: {
              type: "object",
              properties: {
                reply_text: { type: "string", description: "Diplomatická odpověď v češtině (2-4 věty, středověký tón)" },
                disposition_change: { type: "integer", description: "Změna postoje k hráči (-20 až +20)" },
                action: {
                  type: "string",
                  enum: [
                    "none",
                    "send_ultimatum",
                    "declare_war",
                    "offer_peace",
                    "accept_peace",
                    "reject_peace",
                    "offer_trade",
                    "offer_alliance",
                    "trade_embargo",
                    "threaten",
                    "praise",
                  ],
                  description: "Konkrétní diplomatická akce na základě konverzace",
                },
                action_detail: { type: "string", description: "Detail akce — text ultimáta, podmínky míru, typ obchodu apod." },
                peace_conditions: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["white_peace", "tribute", "territory", "vassalage"] },
                    tribute_amount: { type: "number" },
                  },
                  description: "Podmínky míru (pokud action = offer_peace)",
                },
              },
              required: ["reply_text", "disposition_change", "action"],
            },
          },
        }],
        toolChoice: { type: "function", function: { name: "diplomatic_response" } },
      });

      if (!result.ok) {
        if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
        if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán" }, 402);
        return jsonResponse({ replyText: `${aiFaction.faction_name} mlčí...`, suggestedActionEvent: null, actionsTaken: [], debug: result.debug });
      }

      // Parse AI response
      let responseData: any;
      const toolCall = result.data?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        responseData = JSON.parse(toolCall.function.arguments);
      } else if (result.data?.content) {
        responseData = { reply_text: result.data.content, disposition_change: 0, action: "none" };
      } else {
        return jsonResponse({ replyText: `${aiFaction.faction_name} mlčí...`, suggestedActionEvent: null, actionsTaken: [] });
      }

      const actionsTaken: string[] = [];

      // ── Execute disposition change ──
      if (responseData.disposition_change && responseData.disposition_change !== 0) {
        const newDisp = { ...(faction?.disposition as Record<string, number> || {}) };
        const delta = Math.max(-20, Math.min(20, responseData.disposition_change));
        newDisp[playerName] = Math.max(-100, Math.min(100, (newDisp[playerName] || 0) + delta));
        await supabase.from("ai_factions").update({ disposition: newDisp }).eq("id", faction!.id);
        actionsTaken.push(`disposition: ${delta > 0 ? "+" : ""}${delta}`);
      }

      // ── Execute diplomatic action ──
      const action = responseData.action || "none";
      if (action !== "none") {
        try {
          await executeDiplomaticAction(
            supabase, sessionId, turn, aiFaction.faction_name, playerName,
            action, responseData, faction!, activeWars, peaceOffers,
          );
          actionsTaken.push(action);
        } catch (err) {
          console.error(`Diplomatic action ${action} failed:`, err);
          actionsTaken.push(`${action}:failed`);
        }
      }

      return jsonResponse({
        replyText: responseData.reply_text || `${aiFaction.faction_name} mlčí...`,
        suggestedActionEvent: action !== "none" ? action : null,
        actionsTaken,
        dispositionChange: responseData.disposition_change,
        debug: result.debug,
      });
    }

    // ── CITY-STATE DIPLOMACY (unchanged) ──
    const systemPrompt = `Jsi středověký diplomat zastupující městský stát "${npc.name}" (typ: ${npc.type}, nálada: ${npc.mood}).
Odpovídej VŽDY česky v tónu středověké diplomatické korespondence.
Buď stručný (max 3 věty). Reaguj na poslední zprávy v konverzaci.
Nikdy nevymýšlej numerické výsledky ani nové události — pouze diplomatickou odpověď.`;

    const userPrompt = `Kontext světa: ${JSON.stringify(worldFacts?.slice(0, 10) || [])}
Nedávné události: ${JSON.stringify(recentConfirmedEvents?.slice(0, 5) || [])}
Poslední zprávy:
${(recentMessages || []).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n")}

Odpověz jako diplomat městského státu ${npc.name}.`;

    const result = await invokeAI(ctx, { systemPrompt, userPrompt });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit, zkuste později." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Nedostatek kreditů." }, 402);
      return jsonResponse({ replyText: "Diplomat mlčí...", suggestedActionEvent: null, debug: result.debug });
    }

    return jsonResponse({ replyText: result.data?.content || "Diplomat mlčí...", suggestedActionEvent: null, debug: result.debug });
  } catch (e) {
    console.error("Diplomacy reply error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});

// ═══════════════════════════════════════════
// DIPLOMATIC ACTION EXECUTOR
// ═══════════════════════════════════════════

async function executeDiplomaticAction(
  supabase: any,
  sessionId: string,
  turn: number,
  factionName: string,
  playerName: string,
  action: string,
  data: any,
  faction: any,
  activeWars: any[],
  peaceOffers: any[],
) {
  switch (action) {
    case "send_ultimatum": {
      const text = `[ULTIMÁTUM] ${data.action_detail || `${factionName} žádá okamžité splnění podmínek, jinak bude následovat válka.`}`;
      // Post to diplomacy room
      await postToRoom(supabase, sessionId, factionName, playerName, text);
      // Public declaration
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName, turn_number: turn,
        declaration_type: "ultimatum", original_text: text, tone: "Threatening",
        target_empire_ids: [playerName], visibility: "PUBLIC",
        status: "published", ai_generated: true,
      }).then(() => {}, () => {});
      // Game event
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "diplomacy", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: `${factionName} poslal ultimátum hráči ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { action: "ultimatum", target: playerName },
      }).then(() => {}, () => {});
      break;
    }

    case "declare_war": {
      // Check no active war already
      const hasWar = activeWars.some((w: any) =>
        (w.declaring_player === factionName && w.target_player === playerName) ||
        (w.declaring_player === playerName && w.target_player === factionName)
      );
      if (hasWar) break;

      const manifest = data.action_detail || `${factionName} vyhlašuje válku ${playerName}!`;
      await supabase.from("war_declarations").insert({
        session_id: sessionId, declaring_player: factionName,
        target_player: playerName, status: "active",
        manifest_text: manifest, declared_turn: turn,
        stability_penalty_applied: true,
      });
      // Stability penalties
      for (const owner of [factionName, playerName]) {
        const penalty = owner === factionName ? 5 : 8;
        const { data: cities } = await supabase.from("cities")
          .select("id, city_stability").eq("session_id", sessionId).eq("owner_player", owner);
        for (const c of (cities || [])) {
          await supabase.from("cities").update({
            city_stability: Math.max(0, (c.city_stability || 50) - penalty),
          }).eq("id", c.id);
        }
      }
      // Declaration + event
      await supabase.from("declarations").insert({
        session_id: sessionId, player_name: factionName, turn_number: turn,
        declaration_type: "war_declaration", original_text: manifest,
        tone: "Threatening", target_empire_ids: [playerName],
        visibility: "PUBLIC", status: "published", ai_generated: true,
      }).then(() => {}, () => {});
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "war", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: manifest, truth_state: "canon", actor_type: "ai_faction",
        reference: { targetPlayer: playerName },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `⚔️ ${factionName} vyhlašuje VÁLKU! ${manifest}`);
      break;
    }

    case "offer_peace": {
      const war = activeWars.find((w: any) =>
        (w.declaring_player === factionName && w.target_player === playerName) ||
        (w.declaring_player === playerName && w.target_player === factionName)
      );
      if (!war) break;
      const conditions = data.peace_conditions || { type: "white_peace" };
      await supabase.from("war_declarations").update({
        status: "peace_offered", peace_offered_by: factionName,
        peace_offer_text: data.action_detail || `${factionName} nabízí mír.`,
        peace_conditions: conditions,
      }).eq("id", war.id);
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🕊️ [MÍROVÁ NABÍDKA] ${data.action_detail || "Nabízíme mír za rozumných podmínek."}`);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "diplomacy", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: `${factionName} nabízí mír hráči ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
      }).then(() => {}, () => {});
      break;
    }

    case "accept_peace": {
      const offer = peaceOffers.find((w: any) =>
        w.peace_offered_by === playerName &&
        ((w.declaring_player === factionName && w.target_player === playerName) ||
         (w.declaring_player === playerName && w.target_player === factionName))
      );
      if (!offer) break;
      await supabase.from("war_declarations").update({
        status: "peace_accepted", ended_turn: turn,
      }).eq("id", offer.id);
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🕊️ [MÍR PŘIJAT] ${factionName} souhlasí s mírem.`);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "treaty", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: `Mír uzavřen mezi ${factionName} a ${playerName}.`,
        treaty_type: "peace", truth_state: "canon", actor_type: "ai_faction",
        terms_summary: JSON.stringify(offer.peace_conditions),
      }).then(() => {}, () => {});
      break;
    }

    case "reject_peace": {
      const rejOffer = peaceOffers.find((w: any) =>
        w.peace_offered_by === playerName
      );
      if (!rejOffer) break;
      await supabase.from("war_declarations").update({
        status: "active", peace_offered_by: null,
        peace_offer_text: null, peace_conditions: {},
      }).eq("id", rejOffer.id);
      await postToRoom(supabase, sessionId, factionName, playerName,
        `⚔️ ${factionName} ODMÍTÁ vaši nabídku míru!`);
      break;
    }

    case "offer_trade": {
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "trade", player: factionName,
        turn_number: turn, confirmed: true, importance: "normal",
        note: data.action_detail || `${factionName} nabízí obchodní dohodu hráči ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "trade_offer" },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `💰 [OBCHODNÍ NABÍDKA] ${data.action_detail || "Nabízíme vzájemně výhodný obchod."}`);
      break;
    }

    case "offer_alliance": {
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "diplomacy", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: data.action_detail || `${factionName} navrhuje spojenectví s hráčem ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "alliance_proposal" },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🤝 [NABÍDKA SPOJENECTVÍ] ${data.action_detail || "Navrhujeme formální spojenectví."}`);
      break;
    }

    case "trade_embargo": {
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "trade", player: factionName,
        turn_number: turn, confirmed: true, importance: "normal",
        note: `${factionName} uvaluje obchodní embargo na ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "embargo" },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🚫 [EMBARGO] ${data.action_detail || "Veškerý obchod s vaší říší je pozastaven."}`);
      break;
    }

    case "threaten": {
      await postToRoom(supabase, sessionId, factionName, playerName,
        `⚠️ [HROZBA] ${data.action_detail || "Varujeme vás. Další provokace nebude tolerována."}`);
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "diplomacy", player: factionName,
        turn_number: turn, confirmed: true, importance: "normal",
        note: `${factionName} vyhrožuje hráči ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
      }).then(() => {}, () => {});
      break;
    }

    case "praise": {
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🌟 [POCHVALA] ${data.action_detail || "Vaše moudrost je obdivuhodná."}`);
      break;
    }
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

async function postToRoom(
  supabase: any, sessionId: string, sender: string, target: string, text: string,
) {
  const { data: room } = await supabase.from("diplomacy_rooms")
    .select("id").eq("session_id", sessionId)
    .or(`and(participant_a.eq.${sender},participant_b.eq.${target}),and(participant_a.eq.${target},participant_b.eq.${sender})`)
    .limit(1).maybeSingle();

  let roomId = room?.id;
  if (!roomId) {
    const { data: newRoom } = await supabase.from("diplomacy_rooms").insert({
      session_id: sessionId, participant_a: sender, participant_b: target,
      room_type: "ai_faction",
    }).select("id").single();
    roomId = newRoom?.id;
  }
  if (!roomId) return;

  await supabase.from("diplomacy_messages").insert({
    room_id: roomId, sender, sender_type: "ai_faction",
    message_text: text, secrecy: "PRIVATE",
  });
}
