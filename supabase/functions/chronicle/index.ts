import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { events, memories, epochStyle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        chronicle: "Kronikář právě odpočívá... (API klíč není nakonfigurován)",
        suggestedMemories: []
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const styleInstructions: Record<string, string> = {
      myty: "Piš jako starověký mytograf. Používej legendární, epický jazyk plný metafor a nadpřirozených prvků. Události přetvářej v mýty a báje.",
      kroniky: "Piš jako středověký kronikář. Používej formální, vznešený jazyk s archaickými obraty. Zaznamenávej události jako důležité historické záznamy.",
      moderni: "Piš jako moderní novinář. Používej stručný, faktický styl zpravodajství. Události prezentuj jako novinové články s titulky.",
    };

    const systemPrompt = `Jsi kronikář civilizační deskové hry. ${styleInstructions[epochStyle] || styleInstructions.kroniky}

Tvým úkolem je:
1. Převést potvrzené herní události do narativního textu kroniky (česky).
2. Navrhnout 0-3 nové "vzpomínky světa" — trvalé fakty, tradice, nebo vtipné poznámky, které vyplývají z událostí.

Odpověz ve formátu JSON:
{
  "chronicle": "text kroniky...",
  "suggestedMemories": ["fakt 1", "fakt 2"]
}`;

    const userContent = `Potvrzené události:\n${JSON.stringify(events, null, 2)}\n\nExistující paměť světa:\n${JSON.stringify(memories, null, 2)}`;

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
            name: "write_chronicle",
            description: "Write chronicle text and suggest world memories",
            parameters: {
              type: "object",
              properties: {
                chronicle: { type: "string", description: "Chronicle narrative text in Czech" },
                suggestedMemories: {
                  type: "array",
                  items: { type: "string" },
                  description: "Suggested world memory facts in Czech"
                }
              },
              required: ["chronicle", "suggestedMemories"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "write_chronicle" } },
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
        chronicle: "Kronikář selhal... zkuste to znovu.",
        suggestedMemories: []
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fallback: try parsing content directly
    const content = data.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch {
      return new Response(JSON.stringify({
        chronicle: content || "Kronikář mlčí...",
        suggestedMemories: []
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("chronicle error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
