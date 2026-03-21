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
- Pro offer_trade MUSÍŠ vyplnit trade_offer_details s konkrétními surovinami a množstvím!
- Pro open_borders, defense_pact, condemnation, joint_decree vyplň pact_details.
- open_borders = otevření hranic (+15% obchod, +5% porodnost, +10% migrace)
- defense_pact = obranný pakt (automatický vstup do války při napadení spojence)
- condemnation = společné odsouzení třetí strany (-10 disposition pro odsouzeného)
- joint_decree = společný dekret s vlastním textem a důsledky
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
                    "open_borders",
                    "condemnation",
                    "defense_pact",
                    "joint_decree",
                    "threaten",
                    "praise",
                  ],
                  description: "Konkrétní diplomatická akce na základě konverzace",
                },
                action_detail: { type: "string", description: "Detail akce — text ultimáta, podmínky míru, typ obchodu apod." },
                trade_offer_details: {
                  type: "object",
                  properties: {
                    offer_resource: { type: "string", enum: ["gold", "grain", "wood", "stone", "iron"] },
                    offer_amount: { type: "integer", description: "Množství nabízené suroviny za kolo (1-50)" },
                    request_resource: { type: "string", enum: ["gold", "grain", "wood", "stone", "iron"] },
                    request_amount: { type: "integer", description: "Množství požadované suroviny za kolo (1-50)" },
                    duration_turns: { type: "integer", description: "Délka obchodní dohody v kolech (3-20)" },
                  },
                  description: "Detaily obchodní nabídky (pokud action = offer_trade)",
                },
                pact_details: {
                  type: "object",
                  properties: {
                    target_party: { type: "string", description: "Třetí strana (pro condemnation, joint_decree)" },
                    proclamation_text: { type: "string", description: "Text proklamace/paktu" },
                    duration_turns: { type: "integer", description: "Délka paktu v kolech (0 = trvalý)" },
                  },
                  description: "Detaily paktu (pro alliance, open_borders, defense_pact, condemnation, joint_decree)",
                },
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

      // Parse AI response — invokeAI already extracts tool_call arguments into result.data
      let responseData: any;
      if (result.data?.reply_text) {
        // Tool call was parsed by invokeAI — data IS the diplomatic_response object
        responseData = result.data;
      } else if (result.data?.content) {
        // AI returned plain text instead of using the tool
        responseData = { reply_text: result.data.content, disposition_change: 0, action: "none" };
      } else if (typeof result.data === "object" && result.data) {
        // Fallback: try to use whatever came back
        responseData = result.data;
      } else {
        return jsonResponse({ replyText: `${aiFaction.faction_name} mlčí...`, suggestedActionEvent: null, actionsTaken: [] });
      }
      
      console.log(`[diplomacy-reply] Parsed response: action=${responseData.action}, disposition=${responseData.disposition_change}, text=${(responseData.reply_text || "").substring(0, 80)}`)

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

      // ── Write diplomatic memory for this interaction ──
      const memoryTypeMap: Record<string, string> = {
        declare_war: "war", send_ultimatum: "threat", offer_peace: "peace",
        accept_peace: "peace", trade_embargo: "threat", open_borders: "cooperation",
        defense_pact: "cooperation", condemnation: "threat", propose_trade: "trade_success",
        none: "neutral",
      };
      const memType = memoryTypeMap[action] || "neutral";
      if (memType !== "neutral") {
        await supabase.from("diplomatic_memory").insert({
          session_id: sessionId,
          faction_a: aiFaction.faction_name,
          faction_b: playerName,
          memory_type: memType,
          detail: `${action}: ${(responseData.reply_text || "").substring(0, 300)}`,
          turn_number: turn,
          importance: ["declare_war", "accept_peace"].includes(action) ? 3 : ["send_ultimatum", "defense_pact"].includes(action) ? 2 : 1,
          decay_rate: memType === "war" ? 0.02 : 0.05,
        }).then(() => {}, (e: any) => console.warn("Diplomatic memory insert failed:", e));
      }

      // ── Insert chronicle, city_rumors, world_events for critical actions ──
      const criticalActions = ["declare_war", "offer_peace", "accept_peace", "send_ultimatum", "trade_embargo", "open_borders", "defense_pact", "condemnation"];
      if (criticalActions.includes(action)) {
        const quote = responseData.reply_text ? `„${responseData.reply_text}"` : "";
        const detail = responseData.action_detail || "";

        const chronicleTexts: Record<string, string> = {
          declare_war: `⚔️ Vládce ${aiFaction.faction_name} vyhlásil válku říši ${playerName}. ${detail ? `Ve svém manifestu prohlásil: ${detail}` : ""} ${quote ? `\n\nSlovy diplomata: ${quote}` : ""}`,
          send_ultimatum: `⚠️ Z paláce ${aiFaction.faction_name} dorazil posel s ultimátem adresovaným ${playerName}: ${detail || "Splňte naše podmínky, či čelte následkům."} ${quote ? `\n\nDoslovná citace: ${quote}` : ""}`,
          offer_peace: `🕊️ ${aiFaction.faction_name} vyslal mírové poselstvo k ${playerName}. ${detail} ${quote ? `\n\nSlova vyslance: ${quote}` : ""}`,
          accept_peace: `🕊️ Mír byl uzavřen mezi ${aiFaction.faction_name} a ${playerName}. Válečné útrapy jsou u konce. ${quote ? `\n\nPři podpisu smlouvy ${aiFaction.faction_name} pronesl: ${quote}` : ""}`,
          trade_embargo: `🚫 ${aiFaction.faction_name} uvalil obchodní embargo na ${playerName}. Veškeré obchodní cesty byly zablokovány. ${quote ? `\n\n${quote}` : ""}`,
          open_borders: `🌍 ${aiFaction.faction_name} navrhuje otevření hranic s ${playerName}. ${detail} ${quote ? `\n\n${quote}` : ""}`,
          defense_pact: `🛡️ ${aiFaction.faction_name} navrhuje obranný pakt s ${playerName}. ${detail} ${quote ? `\n\n${quote}` : ""}`,
          condemnation: `⚖️ ${aiFaction.faction_name} navrhuje společné odsouzení ${responseData.pact_details?.target_party || "nepřítele"}. ${detail} ${quote ? `\n\n${quote}` : ""}`,
        };

        // Chronicle entry with quote + narrative
        try {
          await supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: chronicleTexts[action] || `Diplomatická akce: ${action}`,
            epoch_style: "kroniky",
            source_type: "chronicle",
            turn_from: turn,
            turn_to: turn,
          });
          console.log(`[diplomacy-reply] Inserted chronicle entry for ${action}`);
        } catch (e) {
          console.error("Chronicle entry insert failed:", e);
        }

        // World event — visible in encyclopedia
        const worldEventTitles: Record<string, string> = {
          declare_war: `Vyhlášení války: ${aiFaction.faction_name} vs. ${playerName}`,
          send_ultimatum: `Ultimátum od ${aiFaction.faction_name}`,
          offer_peace: `Mírová nabídka: ${aiFaction.faction_name} → ${playerName}`,
          accept_peace: `Mírová smlouva: ${aiFaction.faction_name} & ${playerName}`,
          trade_embargo: `Obchodní embargo: ${aiFaction.faction_name} → ${playerName}`,
          open_borders: `Návrh otevření hranic: ${aiFaction.faction_name} ↔ ${playerName}`,
          defense_pact: `Návrh obranného paktu: ${aiFaction.faction_name} ↔ ${playerName}`,
          condemnation: `Odsouzení: ${aiFaction.faction_name} & ${playerName} → ${responseData.pact_details?.target_party || "?"}`,
        };
        try {
          await supabase.from("world_events").insert({
            session_id: sessionId,
            title: worldEventTitles[action] || action,
            date: `Rok ${turn}`,
            summary: (chronicleTexts[action] || "").substring(0, 500),
            tags: [action === "declare_war" ? "war" : "diplomacy"],
            event_type: action === "declare_war" ? "war" : "treaty",
            participants: [aiFaction.faction_name, playerName],
          });
        } catch (e) {
          console.error("World event insert failed:", e);
        }

        // City rumors — in cities of both sides
        const rumorTexts: Record<string, string[]> = {
          declare_war: [
            `Na tržišti se šeptá, že ${aiFaction.faction_name} vyhlásil válku! Lidé se obávají budoucnosti.`,
            `Zvěsti kolují o blížícím se konfliktu s ${aiFaction.faction_name}. Muži ostří zbraně.`,
          ],
          send_ultimatum: [
            `Posel z ${aiFaction.faction_name} prý přinesl hrozivé ultimátum. Co bude dál?`,
          ],
          offer_peace: [
            `Proslýchá se, že ${aiFaction.faction_name} nabízí mír. Snad skončí krveprolití.`,
          ],
          accept_peace: [
            `Radostná zvěst! Válka s ${aiFaction.faction_name} skončila mírem. Lidé slaví v ulicích.`,
          ],
        };
        const rumorList = rumorTexts[action] || [];
        try {
          // Get cities of both factions
          const { data: affectedCities } = await supabase.from("cities")
            .select("id, name, owner_player")
            .eq("session_id", sessionId)
            .in("owner_player", [aiFaction.faction_name, playerName])
            .limit(10);

          for (const city of (affectedCities || []).slice(0, 6)) {
            const rumorText = rumorList[Math.floor(Math.random() * rumorList.length)] || `Diplomatické napětí mezi ${aiFaction.faction_name} a ${playerName} se projevuje i zde.`;
            await supabase.from("city_rumors").insert({
              session_id: sessionId,
              city_id: city.id,
              city_name: city.name,
              text: rumorText,
              tone_tag: action === "declare_war" ? "alarming" : action.includes("peace") ? "hopeful" : "ominous",
              turn_number: turn,
              created_by: "system",
              is_draft: false,
            });
          }
        } catch (e) {
          console.error("City rumors insert failed:", e);
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
      // ── CREATE REAL trade_offers ROW ──
      const trade = data.trade_offer_details || {};
      const offerResource = trade.offer_resource || "gold";
      const offerAmount = Math.max(1, Math.min(50, trade.offer_amount || 5));
      const requestResource = trade.request_resource || "grain";
      const requestAmount = Math.max(1, Math.min(50, trade.request_amount || 5));
      const tradeDuration = Math.max(3, Math.min(20, trade.duration_turns || 5));

      // Find cities for from/to
      const { data: factionCities } = await supabase.from("cities")
        .select("id").eq("session_id", sessionId).eq("owner_player", factionName).limit(1);
      const { data: playerCities } = await supabase.from("cities")
        .select("id").eq("session_id", sessionId).eq("owner_player", playerName).limit(1);

      const fromCityId = factionCities?.[0]?.id || null;
      const toCityId = playerCities?.[0]?.id || null;

      if (fromCityId && toCityId) {
        await supabase.from("trade_offers").insert({
          session_id: sessionId,
          from_player: factionName,
          to_player: playerName,
          from_city_id: fromCityId,
          to_city_id: toCityId,
          offer_resources: { [offerResource]: offerAmount },
          request_resources: { [requestResource]: requestAmount },
          duration_turns: tradeDuration,
          message: data.action_detail || `${factionName} nabízí obchod.`,
          turn_number: turn,
          status: "pending",
        });
      }

      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "trade", player: factionName,
        turn_number: turn, confirmed: true, importance: "normal",
        note: `${factionName} nabízí obchod: ${offerAmount} ${offerResource} za ${requestAmount} ${requestResource} (${tradeDuration} kol).`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "trade_offer", offerResource, offerAmount, requestResource, requestAmount, tradeDuration },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `💰 [OBCHODNÍ NABÍDKA] ${offerAmount}× ${offerResource} za ${requestAmount}× ${requestResource} po dobu ${tradeDuration} kol. ${data.action_detail || ""}`);
      break;
    }

    case "offer_alliance": {
      // ── CREATE diplomatic_pacts ROW ──
      const pact = data.pact_details || {};
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "alliance",
        status: "proposed",
        proposed_by: factionName,
        proposed_turn: turn,
        proclamation_text: pact.proclamation_text || data.action_detail || `${factionName} navrhuje spojenectví.`,
        effects: { diplomatic_bonus: 10 },
        expires_turn: pact.duration_turns ? turn + pact.duration_turns : null,
      });
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "diplomacy", player: factionName,
        turn_number: turn, confirmed: true, importance: "critical",
        note: `${factionName} navrhuje spojenectví s ${playerName}.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "alliance_proposal" },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🤝 [NABÍDKA SPOJENECTVÍ] ${pact.proclamation_text || data.action_detail || "Navrhujeme formální spojenectví."}`);
      break;
    }

    case "trade_embargo": {
      // ── BLOCK existing trade_routes + create pact ──
      // Deactivate all active trade routes between the two
      await supabase.from("trade_routes").update({ status: "embargoed" })
        .eq("session_id", sessionId)
        .or(`and(from_player.eq.${factionName},to_player.eq.${playerName}),and(from_player.eq.${playerName},to_player.eq.${factionName})`)
        .eq("status", "active");

      // Create embargo pact
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "embargo",
        status: "active",
        proposed_by: factionName,
        proposed_turn: turn,
        accepted_turn: turn, // Embargo is unilateral
        proclamation_text: data.action_detail || `${factionName} uvaluje embargo na ${playerName}.`,
        effects: { trade_blocked: true, post_embargo_penalty: 0.3 },
      });

      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "trade", player: factionName,
        turn_number: turn, confirmed: true, importance: "normal",
        note: `${factionName} uvaluje obchodní embargo na ${playerName}. Všechny obchodní cesty zablokovány.`,
        truth_state: "canon", actor_type: "ai_faction",
        reference: { target: playerName, type: "embargo" },
      }).then(() => {}, () => {});
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🚫 [EMBARGO] Veškerý obchod s vaší říší je pozastaven. ${data.action_detail || ""}`);
      break;
    }

    case "open_borders": {
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "open_borders",
        status: "proposed",
        proposed_by: factionName,
        proposed_turn: turn,
        proclamation_text: data.pact_details?.proclamation_text || `${factionName} navrhuje otevření hranic.`,
        effects: { trade_efficiency_bonus: 0.15, birth_rate_bonus: 0.05, migration_bonus: 0.1 },
        expires_turn: data.pact_details?.duration_turns ? turn + data.pact_details.duration_turns : null,
      });
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🌍 [OTEVŘENÍ HRANIC] ${data.pact_details?.proclamation_text || "Navrhujeme otevření hranic pro vzájemný prospěch."}`);
      break;
    }

    case "defense_pact": {
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "defense_pact",
        status: "proposed",
        proposed_by: factionName,
        proposed_turn: turn,
        proclamation_text: data.pact_details?.proclamation_text || `${factionName} navrhuje obranný pakt.`,
        effects: { auto_war_on_attack: true },
        expires_turn: data.pact_details?.duration_turns ? turn + data.pact_details.duration_turns : null,
      });
      await postToRoom(supabase, sessionId, factionName, playerName,
        `🛡️ [OBRANNÝ PAKT] ${data.pact_details?.proclamation_text || "Navrhujeme vzájemný obranný pakt."}`);
      break;
    }

    case "condemnation": {
      const target = data.pact_details?.target_party || "";
      if (!target) break;
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "condemnation",
        target_party: target,
        status: "proposed",
        proposed_by: factionName,
        proposed_turn: turn,
        proclamation_text: data.pact_details?.proclamation_text || `Společné odsouzení ${target}.`,
        effects: { disposition_penalty: -10 },
      });
      // Apply disposition penalty to target from this faction
      const { data: targetFaction } = await supabase.from("ai_factions").select("id, disposition")
        .eq("session_id", sessionId).eq("faction_name", target).maybeSingle();
      if (targetFaction) {
        const disp = { ...(targetFaction.disposition as Record<string, number> || {}) };
        disp[factionName] = Math.max(-100, (disp[factionName] || 0) - 10);
        await supabase.from("ai_factions").update({ disposition: disp }).eq("id", targetFaction.id);
      }
      await postToRoom(supabase, sessionId, factionName, playerName,
        `⚖️ [ODSOUZENÍ] ${factionName} navrhuje společné odsouzení ${target}. ${data.pact_details?.proclamation_text || ""}`);
      break;
    }

    case "joint_decree": {
      const decreeTarget = data.pact_details?.target_party || null;
      await supabase.from("diplomatic_pacts").insert({
        session_id: sessionId,
        party_a: factionName,
        party_b: playerName,
        pact_type: "joint_decree",
        target_party: decreeTarget,
        status: "proposed",
        proposed_by: factionName,
        proposed_turn: turn,
        proclamation_text: data.pact_details?.proclamation_text || data.action_detail || `Společný dekret.`,
        effects: {},
      });
      await postToRoom(supabase, sessionId, factionName, playerName,
        `📜 [SPOLEČNÝ DEKRET] ${data.pact_details?.proclamation_text || data.action_detail || "Navrhujeme společné prohlášení."}`);
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
