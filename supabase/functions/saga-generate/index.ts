import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { entity, timeline, actors, rumors, worldEvents, civilizationInfo, diplomacySnippets, declarations, worldNarrative } = sagaContext;
    const sessionId = sagaContext.sessionId || entity?.sessionId;

    // ─── Load narrative config from server_config ───
    let narrativeSaga: any = null;
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
        narrativeSaga = econ.narrative?.saga || null;
      } catch (e) {
        console.warn("Could not load narrative config:", e);
      }
    }

    // If saga generation is disabled, return empty
    if (narrativeSaga && narrativeSaga.enabled === false) {
      return new Response(JSON.stringify({
        chronology: [], saga: "Generování ság je zakázáno v konfiguraci serveru.",
        actors: [], consequences: "", legends: "", isProtoSaga: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const hasHistory = historySynthesis && historySynthesis.synthesis;

    const timelineText = (timeline || []).map((t: any) =>
      `[Kolo ${t.turn}] ${t.title}${t.summary ? ': ' + t.summary : ''} (ID: ${t.eventId})`
    ).join("\n");

    const actorsText = (actors || []).map((a: any) =>
      `${a.name} (${a.role || a.type}) — frakce: ${a.faction || '?'}`
    ).join("\n");

    const eventCount = (timeline || []).length;

    const historySection = hasHistory ? `
=== HISTORICKÁ SYNTÉZA (primární zdroj — MUSÍŠ na ni navázat) ===
${historySynthesis.synthesis}

=== KLÍČOVÁ FAKTA Z HISTORIE ===
${(historySynthesis.keyFacts || []).join("\n")}

=== MOTIVY ===
${(historySynthesis.themes || []).join(", ")}
` : "";

    // Build stance/style instructions from config
    const stanceMap: Record<string, string> = {
      "pro-regime": "Piš královským, oslavným, mírně propagandistickým stylem dvorní kroniky.",
      "neutral": "Piš neutrálním, ale vznešeným kronikářským stylem bez hodnocení.",
      "critical": "Piš kritickým, skeptickým stylem — zdůrazňuj chyby vládců a utrpení lidu.",
      "mythical": "Piš čistě mýtickým, legendárním stylem plným metafor, symbolů a nadpřirozena.",
    };
    const stanceInstruction = narrativeSaga?.stance ? (stanceMap[narrativeSaga.stance] || stanceMap["pro-regime"]) : stanceMap["pro-regime"];
    const customStylePrompt = narrativeSaga?.style_prompt ? `\n\nDODATEČNÝ STYLOVÝ POKYN OD SPRÁVCE HRY:\n${narrativeSaga.style_prompt}` : "";
    const keywordsInstruction = narrativeSaga?.keywords?.length ? `\nPREFEROVANÁ KLÍČOVÁ SLOVA: ${narrativeSaga.keywords.join(", ")}` : "";
    const forbiddenInstruction = narrativeSaga?.forbidden?.length ? `\nZAKÁZANÁ SLOVA (nikdy nepoužívej): ${narrativeSaga.forbidden.join(", ")}` : "";

    // Build world narrative context
    const worldNarrativeSection = worldNarrative ? (() => {
      const parts: string[] = [];
      if (worldNarrative.loreBible) parts.push(`LORE BIBLE SVĚTA:\n${worldNarrative.loreBible}`);
      if (worldNarrative.promptRules) {
        const rules = worldNarrative.promptRules;
        if (rules.world_vibe) parts.push(`ATMOSFÉRA SVĚTA: ${rules.world_vibe}`);
        if (rules.writing_style) parts.push(`STYL PSANÍ: ${rules.writing_style}`);
      }
      if (worldNarrative.worldSeed) parts.push(`SVĚT SEED: ${worldNarrative.worldSeed}`);
      return parts.length > 0 ? `\n\n=== NARATIV SVĚTA (povinně respektuj) ===\n${parts.join("\n\n")}` : "";
    })() : "";

    const flavorSection = entity?.flavorPrompt
      ? `\n\nFLAVOR PROMPT ENTITY (povinně ovlivni tón a atmosféru):\n${entity.flavorPrompt}`
      : "";

    const systemPrompt = `Jsi královský kronikář, který píše vznešeným, mýtickým stylem dvorní kroniky.
${stanceInstruction}${customStylePrompt}${keywordsInstruction}${forbiddenInstruction}${flavorSection}${worldNarrativeSection}

STRIKTNÍ PRAVIDLA:
1. Piš VÝHRADNĚ na základě dodaných dat. ${hasHistory ? 'Tvým HLAVNÍM zdrojem je historická syntéza — interpretuj ji mýticky, ale NEPŘIDÁVEJ nové fakty.' : 'NESMÍŠ vymýšlet nové události.'}
2. KAŽDÝ odstavec MUSÍ obsahovat alespoň jednu referenci na událost ve formátu [[event:EVENT_ID|popis]].
3. Vítězství prezentuj jako naplnění osudu. Utrpení rámuj jako zkoušky ohněm.
4. Vládce/aktéry zobrazuj jako větší-než-život postavy, POUZE pokud existují v datech.
5. Zdůrazňuj kontinuitu, dědictví a nevyhnutelnost velikosti.
6. Pokud má entita flavor prompt, MUSÍŠ ho respektovat jako hlavní tónový pokyn.
7. Pokud existuje lore bible nebo narativ světa, MUSÍŠ do ság integrovat jeho premisu a atmosféru.

POVINNÁ STRUKTURA:
A) "chronology" — Stručná chronologie (8-20 bodů) s [[event:ID|text]]
B) "saga" — Sága místa (700-1400 slov): Mýtická invokace → Věk zkoušek → Zlom → Současná sláva → Odkaz
C) "actors" — Klíčové postavy (name, role, linkedItems)
D) "consequences" — Důsledky pro říši
E) "legends" — Legenda a šeptanda (volitelné, jasně oddělené)

${eventCount < 3 ? 'VAROVÁNÍ: Málo zdrojů (' + eventCount + '). Označ jako proto-ságu.' : ''}`;

    // Build extended context sections
    const rumorsText = (rumors || []).slice(0, 10).map((r: any) =>
      `[${r.city_name}, Kolo ${r.turn_number}, ${r.tone_tag}] ${r.text}`
    ).join("\n");

    const worldEventsText = (worldEvents || []).slice(0, 10).map((we: any) =>
      `[Kolo ${we.created_turn}] ${we.title}: ${we.summary}`
    ).join("\n");

    const civText = civilizationInfo
      ? `Civilizace: ${civilizationInfo.civ_name}\nMýtus: ${civilizationInfo.core_myth || '?'}\nKulturní rys: ${civilizationInfo.cultural_quirk || '?'}\nArchitektura: ${civilizationInfo.architectural_style || '?'}`
      : "";

    const diplomacyText = (diplomacySnippets || []).slice(0, 8).map((d: any) =>
      `[${d.sender}${d.message_tag ? ' (' + d.message_tag + ')' : ''}] ${d.message_text}`
    ).join("\n");

    const declarationsText = (declarations || []).slice(0, 5).map((d: any) =>
      `[${d.player_name}, ${d.declaration_type}] ${d.title || ''}: ${(d.epic_text || d.original_text || '').slice(0, 150)}`
    ).join("\n");

    const userContent = `=== ENTITA ===
Jméno: ${entity.name}
Typ: ${entity.type}
Vlastník: ${entity.owner || '?'}
Tagy: ${(entity.tags || []).join(', ') || 'žádné'}
Info: ${JSON.stringify(entity.extra || {})}
${civText ? '\n=== CIVILIZACE ===\n' + civText : ''}
${historySection}
=== ČASOVÁ OSA (${eventCount} záznamů) ===
${timelineText || 'Žádné události'}

=== AKTÉŘI ===
${actorsText || 'Žádní známí aktéři'}
${rumorsText ? '\n=== ZVĚSTI A ŠEPTANDA ===\n' + rumorsText : ''}
${worldEventsText ? '\n=== SVĚTOVÉ UDÁLOSTI ===\n' + worldEventsText : ''}
${diplomacyText ? '\n=== DIPLOMATICKÁ KORESPONDENCE ===\n' + diplomacyText : ''}
${declarationsText ? '\n=== VYHLÁŠENÍ A DEKRETY ===\n' + declarationsText : ''}

Napiš dvorní kroniku tohoto místa/entity. Využij VŠECHNY dostupné zdroje.`;

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
                chronology: { type: "array", items: { type: "string" }, description: "Bullet points of chronology with [[event:ID|label]] references" },
                saga: { type: "string", description: "Main saga narrative 700-1400 words with inline [[event:ID|label]] references" },
                actors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, role: { type: "string" }, linkedItems: { type: "array", items: { type: "string" } } },
                    required: ["name", "role"], additionalProperties: false,
                  },
                },
                consequences: { type: "string", description: "Economy/stability/army impacts grounded in stats/events" },
                legends: { type: "string", description: "Optional speculative flavor section, clearly labeled as legend" },
                isProtoSaga: { type: "boolean", description: "True if insufficient source data (<3 events)" },
              },
              required: ["chronology", "saga", "actors", "consequences", "isProtoSaga"],
              additionalProperties: false,
            },
          },
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
