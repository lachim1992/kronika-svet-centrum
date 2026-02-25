import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { npc, recentMessages, recentConfirmedEvents, worldFacts, sessionId, aiFaction } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        replyText: `${npc?.name || aiFaction?.faction_name || "Diplomat"} pokyne hlavou a praví: "Vaše slova jsme vyslechli."`,
        suggestedActionEvent: null,
        debug: { provider: "fallback-no-session" },
      });
    }

    const ctx = await createAIContext(sessionId);

    // Determine if this is an AI faction reply or city-state reply
    if (aiFaction) {
      // AI Faction diplomacy
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch faction details
      const { data: faction } = await supabase.from("ai_factions")
        .select("*")
        .eq("session_id", sessionId)
        .eq("faction_name", aiFaction.faction_name)
        .single();

      // Fetch faction's civilization info
      const { data: civ } = await supabase.from("civilizations")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", aiFaction.faction_name)
        .single();

      // Fetch recent tensions between player and this faction
      const { data: tensions } = await supabase.from("civ_tensions")
        .select("total_tension")
        .eq("session_id", sessionId)
        .or(`player_a.eq.${aiFaction.faction_name},player_b.eq.${aiFaction.faction_name}`)
        .order("turn_number", { ascending: false })
        .limit(1);

      const tension = tensions?.[0]?.total_tension || 0;
      const disposition = faction?.disposition || {};
      const personality = faction?.personality || "diplomatic";
      const goals = faction?.goals || [];

      const systemPrompt = `Jsi vládce frakce "${aiFaction.faction_name}" v civilizační strategické hře.
Osobnost: ${personality}
Mýtus: ${civ?.core_myth || "neznámý"}
Kulturní zvláštnost: ${civ?.cultural_quirk || "žádná"}
Architektonický styl: ${civ?.architectural_style || "standardní"}
Postoj k hráči: ${JSON.stringify(disposition)}
Cíle: ${JSON.stringify(goals)}
Tenze s hráčem: ${tension}

PRAVIDLA:
- Odpovídej ČESKY ve středověkém diplomatickém tónu.
- Max 4 věty.
- Reaguj na obsah posledních zpráv.
- Tvoje osobnost ovlivňuje odpověď:
  - aggressive: přímý, hrozivý, požaduje ústupky
  - diplomatic: elegantní, hledá kompromisy
  - mercantile: zaměřený na obchod a zisky
  - isolationist: odměřený, neochotný k závazkům
  - expansionist: ambiciózní, hledá příležitosti k růstu
- Nikdy nevymýšlej číselné výsledky.
- Můžeš navrhnout diplomatický krok (spojenectví, obchod, hrozba) ale nevynucuj ho.`;

      const userPrompt = `Kontext světa: ${JSON.stringify(worldFacts?.slice(0, 8) || [])}
Nedávné události: ${JSON.stringify(recentConfirmedEvents?.slice(0, 5) || [])}
Poslední zprávy:
${(recentMessages || []).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n")}

Odpověz jako vládce frakce ${aiFaction.faction_name}.`;

      const result = await invokeAI(ctx, { systemPrompt, userPrompt });

      if (!result.ok) {
        if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
        if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán" }, 402);
        return jsonResponse({ replyText: `${aiFaction.faction_name} mlčí...`, suggestedActionEvent: null, debug: result.debug });
      }

      return jsonResponse({ replyText: result.data?.content || `${aiFaction.faction_name} mlčí...`, suggestedActionEvent: null, debug: result.debug });
    }

    // Original city-state diplomacy
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

    const replyText = result.data?.content || "Diplomat mlčí...";
    return jsonResponse({ replyText, suggestedActionEvent: null, debug: result.debug });
  } catch (e) {
    console.error("Diplomacy reply error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
