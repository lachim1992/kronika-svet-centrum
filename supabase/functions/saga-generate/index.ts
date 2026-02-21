import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sagaContext, historySynthesis } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API klíč není nakonfigurován" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { entity, timeline, actors } = sagaContext;

    // If we have a pre-generated history synthesis, use it as the primary source
    const hasHistory = historySynthesis && historySynthesis.synthesis;

    const timelineText = (timeline || []).map((t: any) =>
      `[Kolo ${t.turn}] ${t.title}${t.summary ? ': ' + t.summary : ''} (ID: ${t.eventId})`
    ).join("\n");

    const actorsText = (actors || []).map((a: any) =>
      `${a.name} (${a.role || a.type}) — frakce: ${a.faction || '?'}`
    ).join("\n");

    const eventCount = (timeline || []).length;

    // History synthesis section (preferred source)
    const historySection = hasHistory ? `
=== HISTORICKÁ SYNTÉZA (primární zdroj — MUSÍŠ na ni navázat) ===
${historySynthesis.synthesis}

=== KLÍČOVÁ FAKTA Z HISTORIE ===
${(historySynthesis.keyFacts || []).join("\n")}

=== MOTIVY ===
${(historySynthesis.themes || []).join(", ")}
` : "";

    const systemPrompt = `Jsi královský kronikář, který píše vznešeným, mýtickým, mírně propagandistickým stylem dvorní kroniky.

STRIKTNÍ PRAVIDLA:
1. Piš VÝHRADNĚ na základě dodaných dat. ${hasHistory ? 'Tvým HLAVNÍM zdrojem je historická syntéza — interpretuj ji mýticky, ale NEPŘIDÁVEJ nové fakty.' : 'NESMÍŠ vymýšlet nové události.'}
2. KAŽDÝ odstavec MUSÍ obsahovat alespoň jednu referenci na událost ve formátu [[event:EVENT_ID|popis]].
3. Vítězství prezentuj jako naplnění osudu. Utrpení rámuj jako zkoušky ohněm.
4. Vládce/aktéry zobrazuj jako větší-než-život postavy, POUZE pokud existují v datech.
5. Zdůrazňuj kontinuitu, dědictví a nevyhnutelnost velikosti.

POVINNÁ STRUKTURA:
A) "chronology" — Stručná chronologie (8-20 bodů) s [[event:ID|text]]
B) "saga" — Sága místa (700-1400 slov): Mýtická invokace → Věk zkoušek → Zlom → Současná sláva → Odkaz
C) "actors" — Klíčové postavy (name, role, linkedItems)
D) "consequences" — Důsledky pro říši
E) "legends" — Legenda a šeptanda (volitelné, jasně oddělené)

${eventCount < 3 ? 'VAROVÁNÍ: Málo zdrojů (' + eventCount + '). Označ jako proto-ságu.' : ''}`;

    const userContent = `=== ENTITA ===
Jméno: ${entity.name}
Typ: ${entity.type}
Vlastník: ${entity.owner || '?'}
Tagy: ${(entity.tags || []).join(', ') || 'žádné'}
Info: ${JSON.stringify(entity.extra || {})}
${historySection}
=== ČASOVÁ OSA (${eventCount} záznamů) ===
${timelineText || 'Žádné události'}

=== AKTÉŘI ===
${actorsText || 'Žádní známí aktéři'}

Napiš dvorní kroniku tohoto místa/entity.`;

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
            name: "write_saga",
            description: "Write a structured saga with chronology, narrative, actors, consequences and legends",
            parameters: {
              type: "object",
              properties: {
                chronology: {
                  type: "array",
                  items: { type: "string" },
                  description: "Bullet points of chronology with [[event:ID|label]] references"
                },
                saga: { type: "string", description: "Main saga narrative 700-1400 words with inline [[event:ID|label]] references" },
                actors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      role: { type: "string" },
                      linkedItems: { type: "array", items: { type: "string" } }
                    },
                    required: ["name", "role"],
                    additionalProperties: false
                  }
                },
                consequences: { type: "string", description: "Economy/stability/army impacts grounded in stats/events" },
                legends: { type: "string", description: "Optional speculative flavor section, clearly labeled as legend" },
                isProtoSaga: { type: "boolean", description: "True if insufficient source data (<3 events)" }
              },
              required: ["chronology", "saga", "actors", "consequences", "isProtoSaga"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "write_saga" } },
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
      return new Response(JSON.stringify({ error: "AI generování selhalo" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fallback
    const content = data.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({
      chronology: [], saga: content || "Sága se nepodařila vygenerovat.",
      actors: [], consequences: "", legends: "", isProtoSaga: true
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("saga-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
