import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

/**
 * World Chronicle Round (Batch B)
 * - Single canonical chronicle entry per (session, turn).
 * - Loads ALL relevant sources directly from DB (no client trust):
 *   game_events, event_fragments (chronicle_entries source_type=event_fragment),
 *   battles, declarations, completed buildings/wonders, city_rumors (Šeptanda),
 *   feed_reactions, council_evaluations, league_matches, world_memories.
 * - Returns { title, body, highlights[], referencedEventIds[], newSuggestedMemories[], linkedCities[] }.
 * - Idempotent: caller decides INSERT vs UPDATE; DB unique index enforces 1-per-turn.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId: string = body.sessionId;
    const round: number = body.round;
    if (!sessionId || typeof round !== "number") return errorResponse("Missing sessionId or round", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ctx = await createAIContext(sessionId, round);

    // Saga toggle
    const sagaEnabled = ctx.premise.narrativeRules?.saga?.enabled !== false;
    if (!sagaEnabled) {
      return jsonResponse({
        title: `Rok ${round}`,
        body: `📜 Rok ${round} — Generování kroniky je vypnuto v narativní konfiguraci.`,
        chronicleText: `📜 Rok ${round} — Generování kroniky je vypnuto v narativní konfiguraci.`,
        highlights: [],
        referencedEventIds: [],
        newSuggestedMemories: [],
        linkedCities: [],
      });
    }

    // ── Load ALL sources for this turn ──
    const [
      { data: events },
      { data: fragments },
      { data: battles },
      { data: declarations },
      { data: completedBuildings },
      { data: rumors },
      { data: reactions },
      { data: councilEvals },
      { data: leagueMatches },
      { data: worldMemories },
      { data: annotations },
    ] = await Promise.all([
      supabase.from("game_events").select("*").eq("session_id", sessionId)
        .eq("turn_number", round).eq("confirmed", true),
      supabase.from("chronicle_entries").select("id, text, turn_from, source_type, references")
        .eq("session_id", sessionId).eq("turn_from", round).eq("source_type", "event_fragment"),
      supabase.from("battles").select("*").eq("session_id", sessionId).eq("turn_number", round),
      supabase.from("declarations").select("*").eq("session_id", sessionId)
        .eq("turn_number", round).eq("status", "published"),
      supabase.from("city_buildings").select("name, category, description, founding_myth, is_wonder")
        .eq("session_id", sessionId).eq("completed_turn", round),
      supabase.from("city_rumors").select("city_name, text, tone_tag, player_name")
        .eq("session_id", sessionId).eq("turn_number", round).eq("is_draft", false),
      supabase.from("feed_reactions").select("target_type, target_id, player_name, emoji, created_at")
        .eq("session_id", sessionId),
      supabase.from("council_evaluations").select("player_name, round_summary, strategic_outlook")
        .eq("session_id", sessionId).eq("round_number", round),
      supabase.from("league_matches").select("home_score, away_score, highlight_text, status, played_turn")
        .eq("session_id", sessionId).eq("played_turn", round).eq("status", "completed"),
      supabase.from("world_memories").select("text, category").eq("session_id", sessionId).eq("approved", true).limit(40),
      supabase.from("event_annotations").select("author, note_text, visibility, event_id")
        .eq("session_id", sessionId),
    ]);

    const confirmedEvents = events || [];
    const eventIds = confirmedEvents.map((e: any) => e.id).filter(Boolean);
    const referencedEventIds: string[] = eventIds;

    // ── Diagnostics log ──
    console.log(`[chronicle] sources turn=${round} events=${confirmedEvents.length} fragments=${(fragments||[]).length} battles=${(battles||[]).length} decls=${(declarations||[]).length} buildings=${(completedBuildings||[]).length} rumors=${(rumors||[]).length} council=${(councilEvals||[]).length} matches=${(leagueMatches||[]).length}`);

    // ── Serialize ──
    const eventsText = confirmedEvents.map((e: any) =>
      `[${e.event_type}] ${e.player || "?"}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` → ${e.result}` : ""}${e.casualties ? ` (ztráty: ${e.casualties})` : ""}${e.importance === "major" ? " [DŮLEŽITÉ]" : ""}`
    ).join("\n");

    const fragmentsText = (fragments || []).map((f: any) => `• ${f.text}`).join("\n");

    const battlesText = (battles || []).map((b: any) =>
      `BITVA: Útočník síla ${b.attacker_strength_snapshot} vs Obránce síla ${b.defender_strength_snapshot}. Výsledek: ${b.result}. Ztráty: útočník ${b.casualties_attacker}, obránce ${b.casualties_defender}.${b.speech_text ? ` Proslov: "${b.speech_text}"` : ""}${b.biome ? ` Terén: ${b.biome}` : ""}`
    ).join("\n");

    const declarationsText = (declarations || []).map((d: any) =>
      `PROHLÁŠENÍ [${d.declaration_type}] od ${d.player_name}${d.title ? ` — "${d.title}"` : ""}: ${d.epic_text || d.original_text}${d.tone ? ` (tón: ${d.tone})` : ""}`
    ).join("\n");

    const buildingsText = (completedBuildings || []).map((b: any) =>
      `${b.is_wonder ? "DIV SVĚTA" : "STAVBA"} dokončena: "${b.name}"${b.category ? ` [${b.category}]` : ""}${b.founding_myth ? ` — Mýtus: ${b.founding_myth}` : ""}${b.description ? ` Popis: ${b.description}` : ""}`
    ).join("\n");

    const rumorsText = (rumors || []).map((r: any) =>
      `ŠEPTANDA z ${r.city_name} [${r.tone_tag || "neutral"}]: ${r.text}`
    ).join("\n");

    // Reactions filtered to this turn's rumor IDs
    const turnRumorIds = new Set((rumors || []).map((r: any) => r.id).filter(Boolean));
    const turnReactions = (reactions || []).filter((r: any) => turnRumorIds.has(r.target_id));
    const reactionsAgg: Record<string, string[]> = {};
    for (const r of turnReactions) {
      const key = r.target_id;
      if (!reactionsAgg[key]) reactionsAgg[key] = [];
      reactionsAgg[key].push(`${r.emoji} ${r.player_name}`);
    }
    const reactionsText = Object.entries(reactionsAgg)
      .map(([_id, list]) => `Reakce: ${list.join(", ")}`).join("\n");

    const councilText = (councilEvals || []).map((c: any) =>
      `RADA ${c.player_name}: ${c.round_summary}${c.strategic_outlook ? ` | Výhled: ${c.strategic_outlook}` : ""}`
    ).join("\n");

    const matchesText = (leagueMatches || []).map((m: any) =>
      `LIGOVÝ ZÁPAS: ${m.home_score}:${m.away_score}${m.highlight_text ? ` — ${m.highlight_text}` : ""}`
    ).join("\n");

    const annotationsForTurn = (annotations || []).filter((a: any) =>
      a.visibility !== "private" && eventIds.includes(a.event_id)
    );
    const annotationsText = annotationsForTurn.map((a: any) =>
      `${a.author}: "${a.note_text}"`
    ).join("\n");

    const memoriesText = (worldMemories || []).map((m: any) =>
      `[${m.category || "obecné"}] ${m.text}`
    ).join("\n");

    // ── Prompt ──
    const systemPrompt = `Jsi KRONIKÁŘ tohoto světa — postava uvnitř příběhu, ne reportér.
Píšeš FINÁLNÍ shrnující zápis Kroniky světa pro kolo ${round}. Tento text si hráči budou znovu čítat po dohrané hře. Musí být VÝJIMEČNÝ.

ABSOLUTNÍ PRAVIDLA:
1. NEVYMÝŠLEJ čísla, výsledky, ztráty ani události. Pracuj POUZE s dodanými daty. Smíš je interpretovat narativně, propojovat příčiny a následky, vyjadřovat tón a atmosféru.
2. Žádné odrážky, žádný výčet "stalo se to a to". Souvislý vyprávěcí text rozdělený na 3–6 odstavců, každý odstavec tématicky propojený.
3. Rozsah 800–1200 slov. Češtinou na úrovni dobré historické prózy.
4. Začni jednou silnou úvodní větou kola. Skonči glosou kronikáře (1–2 věty hodnotící váhu kola v dějinách).
5. MUSÍŠ zmínit:
   • nejvýraznější vojenskou nebo politickou událost,
   • alespoň jednu kulturní/sportovní/lidskou stopu (ŠEPTANDA, ligový zápas, dokončený div, prohlášení),
   • alespoň jednu reakci/hlas lidu (ŠEPTANDA s reakcemi nebo poznámka hráče), pokud existují.
6. Stavby a divy popisuj jako monumenty s odkazem na jejich mýtus.
7. Jména měst a hráčů cituj přesně tak, jak jsou v datech.
8. Výstup MUSÍ být v češtině.
9. Odpověz POUZE voláním funkce write_world_chronicle.

VÝSTUPNÍ POLE:
• title — krátký poetický nadpis kola (max 80 znaků), bez slova "Kronika".
• body — celý vyprávěcí text (markdown odstavce).
• highlights — 3–6 stručných bodů (max 80 znaků každý) shrnujících jádro kola pro UI chips.
• newSuggestedMemories — 0–3 nové paměti světa.
• linkedCities — seznam měst zmíněných v textu.`;

    const userPrompt = `KOLO ${round}

═══ POTVRZENÉ UDÁLOSTI (SSOT) ═══
${eventsText || "— žádné —"}

═══ DROBNÉ ENGINOVÉ FRAGMENTY (kontext, ne hlavní zdroj) ═══
${fragmentsText || "— žádné —"}

═══ BITVY ═══
${battlesText || "— žádné —"}

═══ PROHLÁŠENÍ A EDIKTY ═══
${declarationsText || "— žádná —"}

═══ DOKONČENÉ STAVBY A DIVY ═══
${buildingsText || "— žádné —"}

═══ ŠEPTANDA (hlasy lidu) ═══
${rumorsText || "— žádná —"}

═══ REAKCE NA ŠEPTANDU ═══
${reactionsText || "— žádné —"}

═══ ZÁPISY KRÁLOVSKÉ RADY ═══
${councilText || "— žádné —"}

═══ LIGOVÉ ZÁPASY (Sphaera) ═══
${matchesText || "— žádné —"}

═══ POZNÁMKY HRÁČŮ ═══
${annotationsText || "— žádné —"}

═══ EXISTUJÍCÍ PAMĚTI SVĚTA (kontinuita) ═══
${memoriesText || "— žádné —"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "write_world_chronicle",
          description: "Write the canonical world chronicle entry for one turn.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short poetic title for this round (max ~80 chars)" },
              body: { type: "string", description: "Full chronicle prose, 800-1200 words, markdown paragraphs, in Czech" },
              highlights: {
                type: "array",
                items: { type: "string" },
                description: "3-6 short highlight chips in Czech (max 80 chars each)",
              },
              newSuggestedMemories: {
                type: "array",
                items: { type: "string" },
                description: "0-3 new world memory facts in Czech",
              },
              linkedCities: {
                type: "array",
                items: { type: "string" },
                description: "Names of cities mentioned in the chronicle",
              },
            },
            required: ["title", "body", "highlights", "newSuggestedMemories", "linkedCities"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "write_world_chronicle" } },
    });

    if (!result.ok) {
      if (result.status === 429) return errorResponse("Rate limit", 429);
      if (result.status === 402) {
        return jsonResponse({
          title: `Rok ${round}`,
          body: `📜 Rok ${round} — Kronikář nemá prostředky. (AI kredity vyčerpány)`,
          chronicleText: `📜 Rok ${round} — Kronikář nemá prostředky. (AI kredity vyčerpány)`,
          highlights: [],
          referencedEventIds,
          newSuggestedMemories: [],
          linkedCities: [],
        });
      }
      throw new Error(result.error || "AI error");
    }

    const data = result.data || {};
    return jsonResponse({
      title: data.title || `Rok ${round}`,
      body: data.body || "",
      // Backwards compat for any caller still reading chronicleText:
      chronicleText: data.body || "",
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
      referencedEventIds,
      newSuggestedMemories: Array.isArray(data.newSuggestedMemories) ? data.newSuggestedMemories : [],
      linkedCities: Array.isArray(data.linkedCities) ? data.linkedCities : [],
    });
  } catch (e) {
    console.error("world-chronicle-round error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
