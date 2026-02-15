import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { city, confirmedCityEvents, approvedWorldFacts, cityMemories, provinceMemories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        introduction: `${city.name} je ${city.level.toLowerCase()} v provincii ${city.province || "neznámé"}. Město patří hráči ${city.ownerName}.`,
        historyRetelling: "Historie tohoto města zatím nebyla zaznamenána kronikářem.",
        bulletFacts: [`${city.name} bylo založeno v roce ${city.foundedRound || 1}.`],
        debug: { usedProvider: "placeholder", eventCount: confirmedCityEvents?.length || 0 }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const flavorNote = city.ownerFlavorPrompt
      ? `\n\nVlastník města si přeje tento stylový kontext (použij POUZE pro tón a atmosféru, NEVYMÝŠLEJ fakta): "${city.ownerFlavorPrompt}"`
      : "";

    const systemPrompt = `Jsi kronikář civilizační deskové hry. Tvým úkolem je napsat představení města a převyprávět jeho historii.

PRAVIDLA:
- Piš česky, vznešeným kronikářským stylem.
- NEVYMÝŠLEJ události ani čísla. Pracuj POUZE s poskytnutými daty.
- Pokud chybí informace, řekni že jsou neznámé.
- Události převyprávěj objektivně.
- MUSÍŠ zapracovat lokální paměti města (tradice, jizvy, kulturní rysy) do představení.
- Pokud město má tradici nebo pověst, zmiň ji přirozeně v textu.
- Rysy města (emergentní vlastnosti) vyplývají z opakovaných pamětí.${flavorNote}`;

    const cityMemsText = (cityMemories || []).map((m: any) => `[${m.category || "tradition"}] ${m.text}`).join("\n");
    const provMemsText = (provinceMemories || []).map((m: any) => `[${m.category || "tradition"}] ${m.text}`).join("\n");

    const userContent = `Město: ${JSON.stringify(city, null, 2)}

Potvrzené události města (${confirmedCityEvents?.length || 0}):
${JSON.stringify(confirmedCityEvents || [], null, 2)}

Schválené světové fakty:
${JSON.stringify(approvedWorldFacts || [], null, 2)}

Lokální paměti města (tradice, jizvy, pověsti):
${cityMemsText || "žádné"}

Paměti provincie:
${provMemsText || "žádné"}`;

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
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_city_profile",
            description: "Write city introduction and history retelling",
            parameters: {
              type: "object",
              properties: {
                introduction: { type: "string", description: "City introduction narrative in Czech" },
                historyRetelling: { type: "string", description: "Retelling of city history based on events, in Czech" },
                bulletFacts: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key bullet-point facts about the city in Czech"
                }
              },
              required: ["introduction", "historyRetelling", "bulletFacts"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "write_city_profile" } },
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
        introduction: "Kronikář selhal...",
        historyRetelling: "",
        bulletFacts: [],
        debug: { usedProvider: "error", eventCount: 0 }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      result.debug = { usedProvider: "lovable-ai", eventCount: confirmedCityEvents?.length || 0 };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const content = data.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      parsed.debug = { usedProvider: "lovable-ai", eventCount: confirmedCityEvents?.length || 0 };
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch {
      return new Response(JSON.stringify({
        introduction: content || "Kronikář mlčí...",
        historyRetelling: "",
        bulletFacts: [],
        debug: { usedProvider: "lovable-ai-fallback", eventCount: 0 }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("cityprofile error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
