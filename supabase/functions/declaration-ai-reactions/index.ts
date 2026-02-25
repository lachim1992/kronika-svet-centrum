import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/**
 * declaration-ai-reactions: When a player publishes a declaration,
 * each AI faction generates a brief diplomatic reaction that is:
 * 1. Posted as a diplomacy message in their shared room
 * 2. Optionally adjusts their disposition toward the player
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, declarationId, declarationText, declarationType, tone, playerName } = await req.json();

    if (!sessionId || !declarationText) {
      return jsonResponse({ reactions: [], error: "Missing params" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active AI factions
    const { data: aiFactions } = await supabase.from("ai_factions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_active", true);

    if (!aiFactions || aiFactions.length === 0) {
      return jsonResponse({ reactions: [] });
    }

    const ctx = await createAIContext(sessionId);
    const reactions: any[] = [];

    for (const faction of aiFactions) {
      try {
        const { data: civ } = await supabase.from("civilizations")
          .select("core_myth, cultural_quirk")
          .eq("session_id", sessionId)
          .eq("player_name", faction.faction_name)
          .single();

        const disposition = (faction.disposition as Record<string, number>)?.[playerName] || 0;

        const systemPrompt = `Jsi vládce frakce "${faction.faction_name}" (osobnost: ${faction.personality}).
Tvůj postoj k hráči ${playerName}: ${disposition} (škála -100 až 100).
Mýtus: ${civ?.core_myth || "neznámý"}.

Hráč ${playerName} právě vydal oficiální vyhlášení. Zareaguj na něj jako vládce své frakce.

PRAVIDLA:
- Odpověz 2-3 větami v češtině, středověkým diplomatickým tónem.
- Reaguj na OBSAH deklarace — pokud je válečná, reaguj ostře; pokud je mírová, reaguj příznivě atd.
- Tvá osobnost ovlivňuje reakci (aggressive = hrozby, diplomatic = kompromisy, mercantile = obchodní úhel).
- Na konci urči číselnou změnu postoje: disposition_change (-20 až +20) podle obsahu deklarace.
- Nikdy nevymýšlej herní události ani čísla.`;

        const userPrompt = `Typ deklarace: ${declarationType}
Tón: ${tone}
Autor: ${playerName}
Text: ${declarationText}`;

        const result = await invokeAI(ctx, {
          systemPrompt,
          userPrompt,
          tools: [{
            type: "function",
            function: {
              name: "react_to_declaration",
              description: "AI faction reaction to a player declaration",
              parameters: {
                type: "object",
                properties: {
                  reaction_text: { type: "string", description: "2-3 sentence reaction in Czech" },
                  disposition_change: { type: "integer", description: "Change in attitude toward player (-20 to +20)" },
                },
                required: ["reaction_text", "disposition_change"],
                additionalProperties: false,
              },
            },
          }],
          toolChoice: { type: "function", function: { name: "react_to_declaration" } },
        });

        if (!result.ok) continue;

        let reactionData: any;
        const toolCall = result.data?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          reactionData = JSON.parse(toolCall.function.arguments);
        } else if (result.data?.content) {
          reactionData = { reaction_text: result.data.content, disposition_change: 0 };
        } else {
          continue;
        }

        // Post reaction as diplomacy message
        const { data: room } = await supabase.from("diplomacy_rooms")
          .select("id")
          .eq("session_id", sessionId)
          .or(`and(participant_a.eq.${playerName},participant_b.eq.${faction.faction_name}),and(participant_a.eq.${faction.faction_name},participant_b.eq.${playerName})`)
          .limit(1)
          .single();

        if (room) {
          await supabase.from("diplomacy_messages").insert({
            room_id: room.id,
            sender: faction.faction_name,
            sender_type: "ai",
            message_text: `📜 Reakce na vyhlášení "${declarationType}": ${reactionData.reaction_text}`,
            secrecy: "PRIVATE",
          });
        }

        // Update disposition
        if (reactionData.disposition_change && reactionData.disposition_change !== 0) {
          const newDisposition = { ...(faction.disposition as Record<string, number>) };
          newDisposition[playerName] = (newDisposition[playerName] || 0) + reactionData.disposition_change;
          await supabase.from("ai_factions")
            .update({ disposition: newDisposition })
            .eq("id", faction.id);
        }

        reactions.push({
          faction: faction.faction_name,
          reaction: reactionData.reaction_text,
          dispositionChange: reactionData.disposition_change,
        });
      } catch (e) {
        console.warn(`Reaction from ${faction.faction_name} failed:`, e);
      }
    }

    return jsonResponse({ reactions });
  } catch (e) {
    console.error("declaration-ai-reactions error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
