import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sagaContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API klíč není nakonfigurován" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { entity, timeline, actors, relations, stats, chronicleNotes, declarations: decls } = sagaContext;
    const sessionId = sagaContext.sessionId || entity?.sessionId;

    // ─── Load narrative config from server_config ───
    let narrativeHistory: any = null;
    if (sessionId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: cfgData } = await sb
          .from("server_config")
          .select("economic_params")
          .eq("session_id", sessionId)
          .maybeSingle();
        const econ = (cfgData as any)?.economic_params || {};
        narrativeHistory = econ.narrative?.history || null;
      } catch (e) {
        console.warn("Could not load narrative config:", e);
      }
    }

    // If history generation is disabled, return empty
    if (narrativeHistory && narrativeHistory.enabled === false) {
      return new Response(JSON.stringify({
        timeline: [], synthesis: "Generování historických syntéz je zakázáno v konfiguraci serveru.",
        keyFacts: [], actors: [], themes: [], insufficient: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const timelineText = (timeline || []).map((t: any) =>
      `[Kolo ${t.turn}] ${t.title}${t.summary ? ': ' + t.summary : ''} (ID: ${t.eventId})`
    ).join("\n");

    const actorsText = (actors || []).map((a: any) =>
      `${a.name} (${a.role || a.type}) — frakce: ${a.faction || '?'}`
    ).join("\n");

    const statsText = (stats || []).map((s: any) =>
      `${s.stat_key}: ${s.stat_value}${s.stat_unit ? ' ' + s.stat_unit : ''} (kolo ${s.source_turn})`
    ).join("\n");

    const chronicleText = (chronicleNotes || []).slice(0, 10).map((c: any) =>
      `[Kola ${c.turn_from || '?'}-${c.turn_to || '?'}] ${c.text?.slice(0, 300)}`
    ).join("\n---\n");

    const eventCount = (timeline || []).length;

    // Build custom style instructions from config
    const customStylePrompt = narrativeHistory?.style_prompt ? `\n\nDODATEČNÝ STYLOVÝ POKYN OD SPRÁVCE HRY:\n${narrativeHistory.style_prompt}` : "";
    const metricsInstruction = narrativeHistory?.include_metrics === false
      ? "\nNEZAHRNUJ numerické metriky (populace, stabilita atd.) do syntézy."
      : "\nZahrnuj konkrétní čísla (kola, populace, stabilita) pokud jsou dostupná.";

    const systemPrompt = `Jsi historický analytik herního světa. Tvým úkolem je vytvořit OBJEKTIVNÍ, NEUTRÁLNÍ historickou syntézu entity na základě dodaných dat.${customStylePrompt}

STRIKTNÍ PRAVIDLA:
1. Piš VÝHRADNĚ na základě dodaných dat. NESMÍŠ vymýšlet nové události, postavy ani fakta.
2. KAŽDÝ bod chronologie MUSÍ obsahovat referenci na událost ve formátu [[event:EVENT_ID|popis]].
3. Styl: věcný, encyklopedický, neutrální. Žádná poetika, žádná propaganda.
4. ${metricsInstruction}
5. Organizuj výstup chronologicky.

POVINNÁ STRUKTURA (přes tool call):
A) "timeline" — Strukturovaná chronologie (pole objektů: turn, title, summary, eventId)
B) "synthesis" — Objektivní historická syntéza (300-800 slov) s inline referencemi [[event:ID|text]]
C) "keyFacts" — Klíčová fakta (pole krátkých textů se statistikami a čísly)
D) "actors" — Klíčoví aktéři (pole: name, role, period)
E) "themes" — Identifikované motivy/témata (pole textů: válka, hladomor, založení, obchod atd.)

${eventCount < 3 ? 'VAROVÁNÍ: Málo zdrojových dat (' + eventCount + ' událostí). Uveď to výslovně. Nedomýšlej.' : ''}`;

    const userContent = `=== ENTITA ===
Jméno: ${entity.name}
Typ: ${entity.type}
Vlastník: ${entity.owner || '?'}
Tagy: ${(entity.tags || []).join(', ') || 'žádné'}
Info: ${JSON.stringify(entity.extra || {})}

=== UDÁLOSTI (${eventCount}) ===
${timelineText || 'Žádné události'}

=== AKTÉŘI ===
${actorsText || 'Žádní známí aktéři'}

=== STATISTIKY ===
${statsText || 'Žádné statistiky'}

=== KRONIKY ===
${chronicleText || 'Žádné záznamy'}

Vytvoř objektivní historickou syntézu.`;

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
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_history",
            description: "Write a structured factual history synthesis",
            parameters: {
              type: "object",
              properties: {
                timeline: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      turn: { type: "number" }, title: { type: "string" },
                      summary: { type: "string" }, eventId: { type: "string" },
                    },
                    required: ["turn", "title", "summary", "eventId"],
                    additionalProperties: false,
                  },
                },
                synthesis: { type: "string", description: "Objective history synthesis 300-800 words with [[event:ID|label]] refs" },
                keyFacts: { type: "array", items: { type: "string" } },
                actors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, role: { type: "string" }, period: { type: "string" } },
                    required: ["name", "role"], additionalProperties: false,
                  },
                },
                themes: { type: "array", items: { type: "string" } },
                insufficient: { type: "boolean", description: "True if <3 source events" },
              },
              required: ["timeline", "synthesis", "keyFacts", "actors", "themes", "insufficient"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_history" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generování selhalo" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" }
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

    return new Response(JSON.stringify({
      timeline: [], synthesis: "Syntéza se nepodařila.", keyFacts: [], actors: [], themes: [], insufficient: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("history-synthesize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
