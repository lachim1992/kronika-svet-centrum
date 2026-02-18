import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, shortText, contentType, sessionId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const typeLabels: Record<string, string> = {
      lore: "příběh nebo legendu", building: "popis stavby nebo budovy",
      monument: "popis monumentu nebo pomníku", legend: "místní legendu",
      battle_account: "válečný záznam", cultural_note: "kulturní poznámku",
      rumor: "zvěst nebo drb",
    };

    const systemPrompt = `Jsi kronikář fantasy světa. Hráč zadal krátký vstup a ty ho rozšíříš do plnohodnotného narativního textu.

PRAVIDLA:
- Piš v češtině, formálním ale čtivým stylem
- Rozšiř hráčův vstup na 2-4 odstavce bohatého textu
- NEVYMÝŠLEJ nová fakta, pouze rozváděj to, co hráč napsal
- Zachovej hráčův záměr a ton
- Odpověz POUZE voláním funkce expand_contribution`;

    const userPrompt = `Rozšiř tento hráčský vstup o entitě "${entityName}" (${entityType}) do ${typeLabels[contentType] || "narativního textu"}:

"${shortText}"`;

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
            name: "expand_contribution",
            description: "Return the expanded contribution text",
            parameters: {
              type: "object",
              properties: {
                expandedText: { type: "string", description: "Expanded narration in Czech, 2-4 paragraphs" },
                imagePrompt: { type: "string", description: "English prompt for illustration" },
              },
              required: ["expandedText"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "expand_contribution" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("expand-contribution error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
