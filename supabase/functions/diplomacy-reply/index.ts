import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { npc, recentMessages, recentConfirmedEvents, worldFacts, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        replyText: `${npc?.name || "Diplomat"} pokyne hlavou a praví: "Vaše slova jsme vyslechli."`,
        suggestedActionEvent: null,
        debug: { provider: "fallback-no-session" },
      });
    }

    const ctx = await createAIContext(sessionId);

    const systemPrompt = `Jsi středověký diplomat zastupující městský stát "${npc.name}" (typ: ${npc.type}, nálada: ${npc.mood}).
Odpovídej VŽDY česky v tónu středověké diplomatické korespondence.
Buď stručný (max 3 věty). Reaguj na poslední zprávy v konverzaci.
Nikdy nevymýšlej numerické výsledky ani nové události — pouze diplomatickou odpověď.`;

    const userPrompt = `Kontext světa: ${JSON.stringify(worldFacts?.slice(0, 10) || [])}
Nedávné události: ${JSON.stringify(recentConfirmedEvents?.slice(0, 5) || [])}
Poslední zprávy:
${(recentMessages || []).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n")}

Odpověz jako diplomat městského státu ${npc.name}.`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
    });

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
