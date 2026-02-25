import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lawName, fullText, effects, playerName, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({ epicText: null });
    }

    const ctx = await createAIContext(sessionId);

    const effectDescriptions = (effects || []).map((e: any) => {
      const labels: Record<string, string> = {
        tax_change: "změna daní", trade_restriction: "obchodní omezení",
        military_funding: "vojenské financování", civil_reform: "občanská reforma",
      };
      return `${labels[e.type] || e.type} (síla: ${e.value})`;
    }).join(", ");

    const systemPrompt = `Jsi královský písař ve fantasy civilizační hře. Tvým úkolem je přepsat zákon do epického, slavnostního znění.

Pravidla:
- Zachovej všechny mechanické efekty zákona
- Přepiš do slavnostního, královského stylu
- Max 3 věty
- Nikdy nevymýšlej nové efekty
- Odpověz pouze přepsaným textem, bez vysvětlení`;

    const result = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt: `Vládce: ${playerName}\nNázev zákona: ${lawName}\nPůvodní text: ${fullText}\nEfekty: ${effectDescriptions}\n\nPřepiš zákon do epického znění:`,
      maxTokens: 300,
    });

    if (!result.ok) {
      return jsonResponse({ epicText: null });
    }

    const epicText = result.data?.content || result.data?.epicText || null;
    return jsonResponse({ epicText, debug: result.debug });
  } catch (e) {
    console.error("law-process error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
