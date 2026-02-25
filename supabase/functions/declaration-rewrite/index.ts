import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({ epicText: text });
    }

    const ctx = await createAIContext(sessionId);

    const systemPrompt = `Jsi dvorní kronikář středověkého impéria. Přepiš následující oficiální vyhlášení do epického, slavnostního stylu. Zachovej význam, ale přidej patos, metafory a slavnostní tón. Odpověz POUZE přepsaným textem, nic dalšího.`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: text,
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků" }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán" }, 402);
      return jsonResponse({ epicText: text });
    }

    const epicText = result.data?.content || text;
    return jsonResponse({ epicText, debug: result.debug });
  } catch (e) {
    console.error("declaration-rewrite error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
