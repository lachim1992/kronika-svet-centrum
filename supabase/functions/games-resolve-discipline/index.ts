import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════
// DISCIPLINE CONFIG (same as games-resolve)
// ═══════════════════════════════════════════
interface DiscConfig {
  primaryWeight: number;
  secondaryWeight: number;
  tertiaryWeight: number;
  tertiaryStat?: string;
  luckFactor: number;
  moraleInfluence: number;
  narrativePrompt: string;
  category: "physical" | "cultural" | "strategic";
}

const DISC_CONFIGS: Record<string, DiscConfig> = {
  sprint: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "strength", luckFactor: 0.18, moraleInfluence: 0.2, category: "physical", narrativePrompt: "SPRINT / BĚH: Popiš závod kolo po kole." },
  wrestling: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "tactics", luckFactor: 0.12, moraleInfluence: 0.4, category: "physical", narrativePrompt: "ZÁPAS: Popiš souboje kolo po kole." },
  archery: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.15, moraleInfluence: 0.3, category: "physical", narrativePrompt: "LUKOSTŘELBA: Popiš střelbu kolo po kole." },
  horse_racing: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.20, moraleInfluence: 0.25, category: "physical", narrativePrompt: "DOSTIHY: Popiš závod kolo po kole." },
  rhetoric: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.10, moraleInfluence: 0.5, category: "cultural", narrativePrompt: "RÉTORIKA: Popiš řečnické duely kolo po kole." },
  philosophy: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.08, moraleInfluence: 0.4, category: "cultural", narrativePrompt: "FILOZOFIE: Popiš filozofické duely kolo po kole." },
  poetry: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.12, moraleInfluence: 0.35, category: "cultural", narrativePrompt: "POEZIE: Popiš básnické duely kolo po kole." },
  sculpture: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "tactics", luckFactor: 0.10, moraleInfluence: 0.3, category: "cultural", narrativePrompt: "SOCHAŘSTVÍ: Popiš sochařskou soutěž kolo po kole." },
  war_simulation: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance", luckFactor: 0.14, moraleInfluence: 0.45, category: "strategic", narrativePrompt: "VÁLEČNÁ SIMULACE: Popiš vojenské simulace kolo po kole." },
  engineering: { primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "strength", luckFactor: 0.10, moraleInfluence: 0.25, category: "strategic", narrativePrompt: "INŽENÝRSTVÍ: Popiš inženýrskou soutěž kolo po kole." },
};

const DEFAULT_CFG: DiscConfig = {
  primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10,
  luckFactor: 0.12, moraleInfluence: 0.3, category: "physical",
  narrativePrompt: "Popiš soutěž kolo po kole.",
};

function computeScore(p: any, disc: any, cfg: DiscConfig, intrigueEffects: Map<string, number>, academyRepMap: Map<string, number>, varianceMult: number): number {
  const primaryVal = p[disc.primary_stat] || 50;
  const secondaryVal = disc.secondary_stat ? p[disc.secondary_stat] || 50 : 50;
  const tertiaryVal = p[cfg.tertiaryStat || "endurance"] || 50;
  const allStats = [p.strength, p.endurance, p.agility, p.tactics, p.charisma];
  const avgStat = allStats.reduce((a: number, b: number) => a + b, 0) / allStats.length;
  const baseScore = primaryVal * cfg.primaryWeight + secondaryVal * cfg.secondaryWeight + tertiaryVal * cfg.tertiaryWeight + avgStat * 0.10;

  let bonus = 0;
  bonus += (p.training_bonus || 0) * 0.5;
  bonus += (p.city_infrastructure_bonus || 0) * 0.3;
  bonus += (p.civ_modifier || 0) * 0.2;
  bonus += (p.morale_modifier || 0) * cfg.moraleInfluence;
  bonus += baseScore * ((academyRepMap.get(p.id) || 0) / 100) * 0.05;

  if (p.form === "peak") bonus += 8;
  if (p.form === "tired") bonus -= 5;
  if (p.form === "injured") bonus -= 15;

  if (p.traits?.includes("Železný")) bonus += 5;
  if (p.traits?.includes("Křehký")) bonus -= 3;
  if (p.traits?.includes("Charismatický") && cfg.category === "cultural") bonus += 8;
  if (p.traits?.includes("Odvážný") && cfg.category === "physical") bonus += 5;
  if (p.traits?.includes("Stoický") && cfg.category === "strategic") bonus += 6;
  bonus += intrigueEffects.get(p.id) || 0;

  const varianceRange = baseScore * cfg.luckFactor * varianceMult;
  const variance = (Math.random() - 0.5) * 2 * varianceRange;
  return baseScore + bonus + variance;
}

/**
 * Generate AI narrative + crowd reactions for one discipline
 */
async function generateNarrativeAndReactions(
  discName: string, discEmoji: string, cfg: DiscConfig,
  qualResults: any[], semiResults: any[], finalResults: any[], rollDiff: number,
): Promise<{ narrative: string[]; crowdReactions: any[] }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const winner = finalResults[0];
  const runnerUp = finalResults[1];
  const tension = rollDiff < 3 ? "EXTRÉMNĚ TĚSNÉ" : rollDiff < 8 ? "Těsné" : rollDiff < 15 ? "Jasná převaha" : "Dominantní výkon";

  const fallbackNarrative = [
    `${discEmoji} ${discName} — soutěž začíná!`,
    `Kvalifikace: ${qualResults.filter(s => s.eliminated).map(s => s.name).join(", ") || "Bez překvapení"}.`,
    `Semifinále: ${semiResults.filter(s => s.eliminated).map(s => s.name).join(", ") || "Postupují favorité"}.`,
    `Finále: ${winner?.name} vs ${runnerUp?.name} — ${tension.toLowerCase()}.`,
    `${discEmoji} VÍTĚZ: ${winner?.name} (${winner?.player})!`,
  ];

  const fallbackReactions = [
    { type: "cheer", text: `Dav jásá při výkonu ${winner?.name}!`, intensity: 3 },
    { type: "gasp", text: `Překvapení v hledišti!`, intensity: 2 },
    { type: "applause", text: `Bouřlivý potlesk pro vítěze!`, intensity: 4 },
  ];

  if (!apiKey) return { narrative: fallbackNarrative, crowdReactions: fallbackReactions };

  const categoryStyle = cfg.category === "physical"
    ? "Piš jako ŽIVÝ KOMENTÁŘ — krátké úsečné věty, zvolání, napětí, přítomný čas."
    : cfg.category === "cultural"
    ? "Popiš KONKRÉTNÍ díla/výkony. Reakce poroty — jména porotců, komentáře, gesta."
    : "Piš jako válečný zpravodaj. Konkrétní manévry, rozhodnutí.";

  const prompt = `Jsi kronikář starověkých her. Napiš reportáž disciplíny "${discName}" v češtině + reakce publika.

${cfg.narrativePrompt}
${categoryStyle}

VRAŤ JSON objekt s dvěma poli:
1. "narrative": pole 10-15 řetězců, každý je řádek reportáže (kvalifikace 2-3, semifinále 2-3, finále 4-6)
2. "crowd_reactions": pole 5-8 objektů {type: "cheer"|"gasp"|"boo"|"applause"|"silence"|"chant", text: string, intensity: 1-5, phase: "qual"|"semi"|"final"}

ÚČASTNÍCI:
Kvalifikace: ${qualResults.map((s, i) => `${i+1}. ${s.name} (${s.player}) ${s.score}${s.eliminated ? " ❌" : " ✅"}`).join("; ")}
Semifinále: ${semiResults.map((s, i) => `${i+1}. ${s.name} (${s.player}) ${s.score}${s.eliminated ? " ❌" : " ✅"}`).join("; ")}
Finále: ${finalResults.map((s, i) => `${i+1}. ${s.name} (${s.player}) ${s.score} ${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""}`).join("; ")}
Napětí: ${tension} (rozdíl: ${rollDiff.toFixed(1)})`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        tools: [{
          type: "function",
          function: {
            name: "report_discipline",
            description: "Return narrative lines and crowd reactions for a discipline.",
            parameters: {
              type: "object",
              properties: {
                narrative: { type: "array", items: { type: "string" } },
                crowd_reactions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      text: { type: "string" },
                      intensity: { type: "number" },
                      phase: { type: "string" },
                    },
                    required: ["type", "text", "intensity", "phase"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["narrative", "crowd_reactions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_discipline" } },
      }),
    });

    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (parsed.narrative?.length >= 3) {
          return {
            narrative: parsed.narrative,
            crowdReactions: parsed.crowd_reactions || fallbackReactions,
          };
        }
      }
    }
  } catch (e) {
    console.error(`AI for ${discName} failed:`, e);
  }

  return { narrative: fallbackNarrative, crowdReactions: fallbackReactions };
}

/**
 * games-resolve-discipline: Resolve ONE discipline for a festival.
 * Called by the host, updates DB + broadcasts via Realtime.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, festival_id, discipline_id } = await req.json();
    if (!session_id || !festival_id || !discipline_id) {
      return new Response(JSON.stringify({ error: "session_id, festival_id, discipline_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check festival
    const { data: festival } = await sb.from("games_festivals").select("*").eq("id", festival_id).single();
    if (!festival) return new Response(JSON.stringify({ error: "Festival nenalezen" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Check discipline not already resolved
    const { data: existingReveal } = await sb.from("games_discipline_reveals")
      .select("status").eq("festival_id", festival_id).eq("discipline_id", discipline_id).maybeSingle();

    if (existingReveal?.status === "resolved") {
      return new Response(JSON.stringify({ error: "Disciplína již vyhodnocena" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark as resolving
    if (existingReveal) {
      await sb.from("games_discipline_reveals").update({ status: "resolving" })
        .eq("festival_id", festival_id).eq("discipline_id", discipline_id);
    } else {
      await sb.from("games_discipline_reveals").insert({
        festival_id, discipline_id, session_id, status: "resolving",
      });
    }

    // Load data
    const [{ data: participants }, { data: disc }, { data: intrigues }] = await Promise.all([
      sb.from("games_participants").select("*").eq("festival_id", festival_id),
      sb.from("games_disciplines").select("*").eq("id", discipline_id).single(),
      sb.from("games_intrigues").select("*").eq("festival_id", festival_id).eq("success", true),
    ]);

    if (!participants || participants.length < 2 || !disc) {
      return new Response(JSON.stringify({ error: "Nedostatek dat" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cfg = DISC_CONFIGS[disc.key] || DEFAULT_CFG;

    // Intrigue effects
    const intrigueEffects = new Map<string, number>();
    for (const ig of (intrigues || [])) {
      if (ig.target_participant_id) {
        const cur = intrigueEffects.get(ig.target_participant_id) || 0;
        if (ig.action_type === "sabotage") intrigueEffects.set(ig.target_participant_id, cur - 15);
        if (ig.action_type === "sponsor") intrigueEffects.set(ig.target_participant_id, cur + 10);
        if (ig.action_type === "bribe") intrigueEffects.set(ig.target_participant_id, cur + 5);
      }
    }

    // Academy bonuses
    const academyRepMap = new Map<string, number>();
    for (const p of participants) {
      if (!p.student_id) continue;
      try {
        const { data: stud } = await sb.from("academy_students").select("academy_id").eq("id", p.student_id).maybeSingle();
        if (stud?.academy_id) {
          const { data: acad } = await sb.from("academies").select("reputation").eq("id", stud.academy_id).maybeSingle();
          if (acad) academyRepMap.set(p.id, acad.reputation || 0);
        }
      } catch (_) {}
    }

    // ═══ RESOLVE 3 PHASES ═══
    const discParts = [...participants];

    // 1. QUALIFICATION
    const qualResults = discParts.map(p => ({
      ...p, score: Math.round(computeScore(p, disc, cfg, intrigueEffects, academyRepMap, 1.2)), eliminated: false,
    })).sort((a, b) => b.score - a.score);
    const survivorsCount = Math.max(2, Math.ceil(qualResults.length * 0.6));
    qualResults.forEach((p, i) => { if (i >= survivorsCount) p.eliminated = true; });

    // 2. SEMIFINALS
    const semiParts = qualResults.filter(p => !p.eliminated);
    const semiResults = semiParts.map(p => ({
      ...p, score: Math.round(computeScore(p, disc, cfg, intrigueEffects, academyRepMap, 0.8)),
    })).sort((a, b) => b.score - a.score);
    const finalistsCount = Math.min(3, semiResults.length);
    semiResults.forEach((p, i) => { if (i >= finalistsCount) p.eliminated = true; });

    // 3. FINALS
    const finalists = semiResults.filter(p => !p.eliminated);
    const finalResults = finalists.map(p => ({
      ...p, score: Math.round(computeScore(p, disc, cfg, intrigueEffects, academyRepMap, 0.5)),
    })).sort((a, b) => b.score - a.score);

    const gold = finalResults[0];
    const silver = finalResults[1];
    const bronze = finalResults[2];
    const rollDiff = gold && silver ? gold.score - silver.score : 10;

    // Generate AI narrative + crowd reactions
    const { narrative, crowdReactions } = await generateNarrativeAndReactions(
      disc.name, disc.icon_emoji, cfg,
      qualResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score, eliminated: p.eliminated })),
      semiResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score, eliminated: p.eliminated })),
      finalResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score })),
      rollDiff,
    );

    // Build reveal script for this discipline
    const revealScript: any[] = [];
    let seq = 0;

    revealScript.push({ seq: ++seq, type: "disc_intro", disc_name: disc.name, disc_emoji: disc.icon_emoji, category: cfg.category, delay_ms: 2000, drama: 2, participantCount: discParts.length });

    for (const line of narrative) {
      revealScript.push({ seq: ++seq, type: "narrative_line", text: line, category: cfg.category, delay_ms: 2000 + line.length * 15, drama: 1 });
    }

    // Medal reveal
    revealScript.push({
      seq: ++seq, type: "disc_result", drama: 3, delay_ms: 4000,
      disc_name: disc.name, disc_emoji: disc.icon_emoji,
      text: `${disc.icon_emoji} VÍTĚZ: ${gold?.athlete_name} (${gold?.player_name})`,
      standings: finalResults.slice(0, 3).map((r, i) => ({
        id: r.id, name: r.athlete_name, player: r.player_name, score: r.score,
        rank: i + 1, medal: i === 0 ? "gold" : i === 1 ? "silver" : "bronze",
      })),
    });

    // Save results to games_results
    const dbResults = [];
    for (const res of finalResults) {
      let medal = null;
      if (res === gold) medal = "gold";
      else if (res === silver) medal = "silver";
      else if (res === bronze) medal = "bronze";

      dbResults.push({
        session_id, festival_id, discipline_id, participant_id: res.id,
        total_score: res.score, rank: finalResults.indexOf(res) + 1, medal,
      });
    }
    if (dbResults.length > 0) {
      await sb.from("games_results").upsert(dbResults, { onConflict: "festival_id,discipline_id,participant_id" });
    }

    // Compute cumulative medal tally
    const { data: allResults } = await sb.from("games_results")
      .select("participant_id, medal").eq("festival_id", festival_id).not("medal", "is", null);

    const medalTally: Record<string, { gold: number; silver: number; bronze: number }> = {};
    for (const r of (allResults || [])) {
      const p = participants.find(pp => pp.id === r.participant_id);
      if (!p) continue;
      if (!medalTally[p.player_name]) medalTally[p.player_name] = { gold: 0, silver: 0, bronze: 0 };
      if (r.medal === "gold") medalTally[p.player_name].gold++;
      if (r.medal === "silver") medalTally[p.player_name].silver++;
      if (r.medal === "bronze") medalTally[p.player_name].bronze++;
    }

    // Update reveal with medal snapshot
    revealScript.push({
      seq: ++seq, type: "medal_update", drama: 1, delay_ms: 1500,
      medals: medalTally,
      new_medal: gold ? { empire: gold.player_name, type: "gold", athlete: gold.athlete_name } : null,
    });

    // Update discipline reveal status
    await sb.from("games_discipline_reveals").update({
      status: "resolved",
      reveal_script: revealScript,
      crowd_reactions: crowdReactions,
      medal_snapshot: medalTally,
      resolved_at: new Date().toISOString(),
    }).eq("festival_id", festival_id).eq("discipline_id", discipline_id);

    // Check if ALL disciplines are resolved
    const { data: allDiscs } = await sb.from("games_disciplines").select("id");
    const { data: allReveals } = await sb.from("games_discipline_reveals")
      .select("discipline_id, status").eq("festival_id", festival_id).eq("status", "resolved");

    const allResolved = (allDiscs || []).every(d => (allReveals || []).some(r => r.discipline_id === d.id));

    // Do NOT auto-conclude — host clicks "Uzavřít hry" button

    return new Response(JSON.stringify({
      ok: true,
      reveal_script: revealScript,
      crowd_reactions: crowdReactions,
      medal_tally: medalTally,
      all_resolved: allResolved,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("games-resolve-discipline error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
