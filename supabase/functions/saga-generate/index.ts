/**
 * saga-generate — Unified AI pipeline
 * 
 * Uses createAIContext + invokeAI for premise injection.
 * All narrative config (stance, keywords, forbidden) comes from premise P1-P7.
 * No duplicate DB queries for chronicle0 or lore bible.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sagaContext, historySynthesis } = await req.json();
    const { entity, timeline, actors, rumors, worldEvents, civilizationInfo, diplomacySnippets, declarations } = sagaContext;
    const sessionId = sagaContext.sessionId || entity?.sessionId;

    if (!sessionId) {
      return jsonResponse({ chronology: [], saga: "Chybí sessionId.", actors: [], consequences: "", legends: "", foundingMythEcho: "", isProtoSaga: true });
    }

    const ctx = await createAIContext(sessionId, undefined, undefined, entity?.owner);

    // Check if saga generation is disabled via premise narrative rules
    const sagaConfig = ctx.premise.narrativeRules?.saga;
    if (sagaConfig && sagaConfig.enabled === false) {
      return jsonResponse({
        chronology: [], saga: "Generování ság je zakázáno v konfiguraci serveru.",
        actors: [], consequences: "", legends: "", foundingMythEcho: "", isProtoSaga: true,
      });
    }

    const hasHistory = historySynthesis?.synthesis;
    const hasFoundingMyth = entity?.foundingLegend && entity.foundingLegend.trim().length > 5;
    const eventCount = (timeline || []).length;

    // ─── Build user content from saga-specific data ───
    const timelineText = (timeline || []).map((t: any) =>
      `[Kolo ${t.turn}] ${t.title}${t.summary ? ': ' + t.summary : ''} (ID: ${t.eventId})`
    ).join("\n");

    const actorsText = (actors || []).map((a: any) =>
      `${a.name} (${a.role || a.type}) — frakce: ${a.faction || '?'}`
    ).join("\n");

    const historySection = hasHistory ? `
=== HISTORICKÁ SYNTÉZA (primární zdroj — MUSÍŠ na ni navázat) ===
${historySynthesis.synthesis}

=== KLÍČOVÁ FAKTA Z HISTORIE ===
${(historySynthesis.keyFacts || []).join("\n")}

=== MOTIVY ===
${(historySynthesis.themes || []).join(", ")}
` : "";

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

    // ─── Founding myth structural instructions ───
    const foundingMythSection = hasFoundingMyth
      ? `\nZAKLADATELSKÝ MÝTUS OD HRÁČE (NEJDŮLEŽITĚJŠÍ VSTUP — celá sága musí být strukturována kolem tohoto mýtu):
${entity.foundingLegend}

PRAVIDLA PRO MÝTUS:
1. Mýtus je RÁMEC celé ságy — každý akt/kapitola se musí k němu vracet.
2. "founding_myth_echo" MUSÍ mýtus parafrázovat a rozvinout do legendární podoby (200-400 slov).
3. V hlavní sáze musí být mýtus zmíněn minimálně 3x.
4. Pokud mýtus zmiňuje konkrétní místa, osoby nebo události, MUSÍŠ je propojit s daty z časové osy.
5. Důsledky pro říši musí reflektovat, jak mýtus ovlivňuje současné rozhodování.`
      : "";

    const structuralInstruction = hasFoundingMyth
      ? `POVINNÁ STRUKTURA (mýtus jako rámec):
A) "chronology" — Stručná chronologie (8-20 bodů) s [[event:ID|text]]. Začni mýtickým aktem založení.
B) "founding_myth_echo" — Rozvinutý zakladatelský mýtus (200-400 slov).
C) "saga" — Sága místa (700-1400 slov): I. AKT ZRODU → II. AKT ZKOUŠEK → III. AKT ZLOMU → IV. AKT ODKAZU
D) "actors" — Klíčové postavy (name, role, linkedItems). Začni zakladatelem z mýtu.
E) "consequences" — Důsledky pro říši (jak mýtus formuje současnou politiku/kulturu)
F) "legends" — Legenda a šeptanda`
      : `POVINNÁ STRUKTURA:
A) "chronology" — Stručná chronologie (8-20 bodů) s [[event:ID|text]]
B) "founding_myth_echo" — Prázdný string
C) "saga" — Sága místa (700-1400 slov): Invokace → Věk zkoušek → Zlom → Sláva → Odkaz
D) "actors" — Klíčové postavy (name, role, linkedItems)
E) "consequences" — Důsledky pro říši
F) "legends" — Legenda a šeptanda`;

    // ─── System prompt (domain-specific only, premise is auto-injected) ───
    const systemPrompt = `Jsi královský kronikář, který píše dvorní kroniku.
${entity?.flavorPrompt ? `FLAVOR PROMPT ENTITY (povinně ovlivni tón): ${entity.flavorPrompt}` : ""}
${foundingMythSection}

STRIKTNÍ PRAVIDLA:
1. Piš VÝHRADNĚ na základě dodaných dat. ${hasHistory ? 'HLAVNÍ zdroj je historická syntéza.' : 'NESMÍŠ vymýšlet nové události.'}
2. KAŽDÝ odstavec MUSÍ obsahovat alespoň jednu referenci [[event:EVENT_ID|popis]].
3. Vítězství prezentuj jako naplnění osudu. Utrpení rámuj jako zkoušky ohněm.
4. Aktéry zobrazuj jako větší-než-život postavy, POUZE pokud existují v datech.
5. Zdůrazňuj kontinuitu, dědictví a nevyhnutelnost velikosti.
${hasFoundingMyth ? '6. ZAKLADATELSKÝ MÝTUS JE RÁMEC — celá sága se musí kolem něj otáčet.' : ''}

${structuralInstruction}

${eventCount < 3 ? 'VAROVÁNÍ: Málo zdrojů (' + eventCount + '). Označ jako proto-ságu.' : ''}`;

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
${rumorsText ? '\n=== ZVĚSTI ===\n' + rumorsText : ''}
${worldEventsText ? '\n=== SVĚTOVÉ UDÁLOSTI ===\n' + worldEventsText : ''}
${diplomacyText ? '\n=== DIPLOMATICKÁ KORESPONDENCE ===\n' + diplomacyText : ''}
${declarationsText ? '\n=== VYHLÁŠENÍ A DEKRETY ===\n' + declarationsText : ''}

Napiš dvorní kroniku tohoto místa/entity. ${hasFoundingMyth ? 'STRUKTURUJ CELOU SÁGU KOLEM ZAKLADATELSKÉHO MÝTU.' : 'Využij VŠECHNY dostupné zdroje.'}`;

    // ─── AI Call ───
    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: userContent,
      tools: [{
        type: "function",
        function: {
          name: "write_saga",
          description: "Write a structured saga with chronology, founding myth echo, narrative, actors, consequences and legends",
          parameters: {
            type: "object",
            properties: {
              chronology: { type: "array", items: { type: "string" }, description: "Bullet points with [[event:ID|label]] references" },
              founding_myth_echo: { type: "string", description: "Expanded retelling of founding myth (200-400 words). Empty if none." },
              saga: { type: "string", description: "Main saga narrative 700-1400 words with [[event:ID|label]] references" },
              actors: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, role: { type: "string" }, linkedItems: { type: "array", items: { type: "string" } } },
                  required: ["name", "role"], additionalProperties: false,
                },
              },
              consequences: { type: "string", description: "How founding myth shapes current politics" },
              legends: { type: "string", description: "Folk tales extending the founding myth" },
              isProtoSaga: { type: "boolean", description: "True if <3 events" },
            },
            required: ["chronology", "founding_myth_echo", "saga", "actors", "consequences", "isProtoSaga"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "write_saga" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků, zkuste to později." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán." }, 402);
      return jsonResponse({
        chronology: [], founding_myth_echo: "", saga: "Sága se nepodařila vygenerovat.",
        actors: [], consequences: "", legends: "", isProtoSaga: true,
        debug: result.debug,
      });
    }

    return jsonResponse({ ...result.data, debug: result.debug });

  } catch (e) {
    console.error("saga-generate error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
