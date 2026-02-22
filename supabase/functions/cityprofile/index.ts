import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { city, confirmedCityEvents, approvedWorldFacts, cityMemories, provinceMemories, sessionId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        introduction: `${city.name} je ${city.level.toLowerCase()} v provincii ${city.province || "neznámé"}. Město patří hráči ${city.ownerName}.`,
        historyRetelling: "Historie tohoto města zatím nebyla zaznamenána kronikářem.",
        bulletFacts: [`${city.name} bylo založeno v roce ${city.foundedRound || 1}.`],
        debug: { usedProvider: "placeholder", eventCount: confirmedCityEvents?.length || 0 }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch session style settings for flavor consistency
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2.49.1");
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let loreBible = "";
    let worldVibe = "";
    let writingStyle = "narrative";
    let constraints = "";
    const effectiveSessionId = sessionId || city.sessionId || null;
    if (effectiveSessionId) {
      const { data: styleCfg } = await sb
        .from("game_style_settings")
        .select("lore_bible, prompt_rules")
        .eq("session_id", effectiveSessionId)
        .maybeSingle();
      loreBible = styleCfg?.lore_bible || "";
      try {
        const rules = styleCfg?.prompt_rules ? JSON.parse(styleCfg.prompt_rules) : {};
        worldVibe = rules.world_vibe || "";
        writingStyle = rules.writing_style || "narrative";
        constraints = rules.constraints || "";
      } catch { /* ignore */ }
    }

    const flavorNote = city.ownerFlavorPrompt
      ? `\n\nVlastník města si přeje tento stylový kontext (použij POUZE pro tón a atmosféru, NEVYMÝŠLEJ fakta): "${city.ownerFlavorPrompt}"`
      : "";

    const writingInstructions = writingStyle === "political-chronicle"
      ? "Piš jako politický kronikář — střízlivě, fakticky, bez přehnaných metafor. Styl zpravodajského komentáře."
      : writingStyle === "epic-saga"
      ? "Piš jako bard — vznešeně, epicky, s metaforami a odkazem na mýty."
      : "Piš jako středověký učenec — vzdělaně, s respektem k faktům.";

    const systemPrompt = [
      `Jsi kronikář civilizační deskové hry. Tvým úkolem je napsat představení města a převyprávět jeho historii.`,
      writingInstructions,
      `PRAVIDLA:`,
      `- Piš česky.`,
      `- NEVYMÝŠLEJ události ani čísla. Pracuj POUZE s poskytnutými daty.`,
      `- Pokud chybí informace, řekni že jsou neznámé.`,
      `- Události převyprávěj objektivně.`,
      `- MUSÍŠ zapracovat lokální paměti města (tradice, jizvy, kulturní rysy) do představení.`,
      `- Pokud město má tradici nebo pověst, zmiň ji přirozeně v textu.`,
      `- Rysy města (emergentní vlastnosti) vyplývají z opakovaných pamětí.`,
      loreBible ? `\nLore světa:\n${loreBible.substring(0, 600)}` : "",
      worldVibe ? `Tón světa: ${worldVibe}` : "",
      constraints ? `Omezení: ${constraints}` : "",
      flavorNote,
    ].filter(Boolean).join("\n");

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

    const aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiPayload = {
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
    };
    const fetchOpts = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiPayload),
    };

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(aiUrl, fetchOpts);
        if (response.ok || response.status === 429 || response.status === 402) break;
      } catch (e) {
        console.error(`AI fetch attempt ${attempt + 1} failed:`, e);
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (!response) {
      return new Response(JSON.stringify({
        introduction: `${city.name} je ${city.level?.toLowerCase() || "město"} v provincii ${city.province || "neznámé"}.`,
        historyRetelling: "Kronikář nemohl navázat spojení.",
        bulletFacts: [],
        debug: { usedProvider: "connection-error" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků, zkuste to později." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({
          introduction: `${city.name} je ${city.level?.toLowerCase() || "město"} v provincii ${city.province || "neznámé"}. Město patří hráči ${city.ownerName || "neznámému"}.`,
          historyRetelling: "Kronikář nemá v tuto chvíli prostředky k záznamu. (AI kredity vyčerpány)",
          bulletFacts: [`${city.name} bylo založeno v roce ${city.foundedRound || 1}.`],
          debug: { usedProvider: "fallback-402", eventCount: confirmedCityEvents?.length || 0 }
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
