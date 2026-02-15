import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, city, era, worldFacts } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        wonderName: `Div ${city || "neznámého města"}`,
        description: `Legendární stavba v ${city || "neznámém městě"}, jejíž sláva se šíří po celém známém světě. Kronikáři dosud marně hledají slova, jimiž by popsali její majestátnost.`,
        memoryFact: `V ${city || "neznámém městě"} stojí div, o němž se zpívají písně od moře k moři.`,
        bonusEffect: null,
        imagePrompt: `A majestic ancient wonder in a ${era || "medieval"} city, illuminated manuscript style, parchment colors, golden details, epic architecture`,
        debug: { provider: "placeholder" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `Jsi legendární kronikář a architekt divů světa v civilizační deskové hře. Tvým úkolem je na základě hráčova popisu vytvořit epický div světa.

Odpověz pomocí funkce create_wonder. Piš česky, epickým středověkým stylem. Jméno divu by mělo být krátké a vznešené. Popis by měl být 2-4 věty. imagePrompt MUSÍ být v angličtině a popisovat vizuální podobu divu pro pozdější generování obrázku.

Existující fakta o světě:
${JSON.stringify(worldFacts || [])}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Hráčův popis: "${prompt}"\nMěsto: ${city || "neznámé"}\nÉra: ${era || "Ancient"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_wonder",
            description: "Create a world wonder with all details",
            parameters: {
              type: "object",
              properties: {
                wonderName: { type: "string", description: "Short majestic name in Czech" },
                description: { type: "string", description: "Epic chronicle-style description in Czech, 2-4 sentences" },
                memoryFact: { type: "string", description: "A world memory fact about this wonder in Czech" },
                bonusEffect: { type: "string", description: "Optional short game bonus effect in Czech, or null" },
                imagePrompt: { type: "string", description: "English visual description for image generation, illuminated manuscript style" },
              },
              required: ["wonderName", "description", "memoryFact", "imagePrompt"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_wonder" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků, zkuste to později." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit vyčerpán." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({
        wonderName: `Div ${city || "světa"}`,
        description: "Kronikář selhal při popisu tohoto divu...",
        memoryFact: "",
        bonusEffect: null,
        imagePrompt: "A majestic ancient wonder, illuminated manuscript style",
        debug: { provider: "placeholder" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ ...result, debug: { provider: "lovable-ai" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      wonderName: `Div ${city || "světa"}`,
      description: data.choices?.[0]?.message?.content || "Neznámý div...",
      memoryFact: "",
      bonusEffect: null,
      imagePrompt: "A majestic ancient wonder, illuminated manuscript style",
      debug: { provider: "fallback" }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wonder error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
