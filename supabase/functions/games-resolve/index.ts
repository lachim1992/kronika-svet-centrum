import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════
// DISCIPLINE-SPECIFIC CONFIG
// ═══════════════════════════════════════════════
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
  sprint: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "strength",
    luckFactor: 0.18, moraleInfluence: 0.2, category: "physical",
    narrativePrompt: `SPRINT / BĚH: Popiš závod kolo po kole. Kvalifikační rozběhy — kdo zaváhá na startu, kdo vyletí z bloků. Semifinále — pozice na dráze, vzájemné souboje, vítr, dech. Finále — poslední metry, fotofiniš, explozivní závěr. Popiš techniku běhu, svalové napětí, reakce davu na tribunách.`,
  },
  wrestling: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "tactics",
    luckFactor: 0.12, moraleInfluence: 0.4, category: "physical",
    narrativePrompt: `ZÁPAS / WRESTLING: Popiš souboje kolo po kole. Kvalifikace — úchopy, pády, kdo padne první. Semifinále — taktické manévry, sevření, úniky. Finále — dramatický souboj, chvaty, bodové hodnocení, rozhodující moment. Popiš fyzickou sílu, pot, prach arény, řev publika.`,
  },
  archery: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.15, moraleInfluence: 0.3, category: "physical",
    narrativePrompt: `LUKOSTŘELBA: Popiš střelbu kolo po kole. Kvalifikace — vzdálenosti, podmínky, kdo míjí. Semifinále — zpřesňující se mušky, napětí před každým výstřelem. Finále — poslední šípy, ticho před výstřelem, let šípu, zásah do středu. Popiš techniku, vítr, soustředění, reakce poroty.`,
  },
  horse_racing: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.20, moraleInfluence: 0.25, category: "physical",
    narrativePrompt: `DOSTIHY / JÍZDA NA KONI: Popiš závod kolo po kole. Kvalifikace — start, koně, jezdci, kdo ztratí kontrolu. Semifinále — pozice na trati, předjíždění v zatáčkách, cval kopyt. Finále — poslední rovinka, bič, pěna koní, cílová čára. Popiš koně, terén, prach, řev diváků.`,
  },
  rhetoric: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.10, moraleInfluence: 0.5, category: "cultural",
    narrativePrompt: `RÉTORIKA / ŘEČNICKÝ SOUBOJ: Popiš řečnické duely kolo po kole. Kvalifikace — témata přednášek, kdo nezaujme porotu. Semifinále — argumenty, protiargumenty, rétorickeé triky, reakce publika. Finále — klíčový projev, emoce, logika, patos, reakce poroty a publika. Popiš gesta řečníků, atmosféru sálu, výrazy porotců.`,
  },
  philosophy: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.08, moraleInfluence: 0.4, category: "cultural",
    narrativePrompt: `FILOZOFIE / DISPUTACE: Popiš filozofické duely kolo po kole. Kvalifikace — úvodní teze, kdo se zamotá. Semifinále — dialogy, protiargumenty, hloubka myšlení. Finále — klíčová teze, kontra-argument, moment ticha, verdikt poroty. Popiš myšlenkové postupy, reakce moudrých porotců, atmosféru akademie.`,
  },
  poetry: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.12, moraleInfluence: 0.35, category: "cultural",
    narrativePrompt: `POEZIE / BÁSNICKÝ SOUBOJ: Popiš básnické duely kolo po kole. Kvalifikace — téma, recitace, kdo neudrží rytmus. Semifinále — verše proti veršům, metafory, rýmy, emoce. Finále — závěrečná báseň, dojetí publika, slzy poroty, aplaus. Popiš konkrétní motivy básní (ne abstraktně), atmosféru amfiteátru, hudební doprovod.`,
  },
  sculpture: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "tactics",
    luckFactor: 0.10, moraleInfluence: 0.3, category: "cultural",
    narrativePrompt: `SOCHAŘSTVÍ: Popiš sochařskou soutěž kolo po kole. Kvalifikace — volba materiálu, hrubá práce, kdo nedokončí. Semifinále — detaily, proporce, povrchová úprava. Finále — odhalení hotových děl, reakce poroty, hodnocení detailů, symboliky. Popiš konkrétní díla (co socha zobrazuje), nástroje, materiál, světlo v dílně.`,
  },
  war_simulation: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "endurance",
    luckFactor: 0.14, moraleInfluence: 0.45, category: "strategic",
    narrativePrompt: `VÁLEČNÁ SIMULACE / STRATEGIE: Popiš vojenské simulace kolo po kole. Kvalifikace — rozmístění jednotek, počáteční manévry, kdo udělá taktickou chybu. Semifinále — obchvaty, léčky, obrana, protiútoky. Finále — rozhodující bitva na písku, brilantní manévr, porážka soupeře. Popiš figurky na mapě, reakce generálů-porotců, napětí v místnosti.`,
  },
  engineering: {
    primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10, tertiaryStat: "strength",
    luckFactor: 0.10, moraleInfluence: 0.25, category: "strategic",
    narrativePrompt: `INŽENÝRSTVÍ / STAVITELSKÁ VÝZVA: Popiš inženýrskou soutěž kolo po kole. Kvalifikace — návrh, výpočty, kdo selže ve statice. Semifinále — konstrukce, inovace, testování nosnosti. Finále — zatěžkávací zkouška, most/stroj/mechanismus v akci, hodnocení poroty. Popiš konkrétní konstrukce, materiály, mechanismy, reakce inženýrů-porotců.`,
  },
};

const DEFAULT_DISC_CONFIG: DiscConfig = {
  primaryWeight: 0.55, secondaryWeight: 0.25, tertiaryWeight: 0.10,
  luckFactor: 0.12, moraleInfluence: 0.3, category: "physical",
  narrativePrompt: "Popiš soutěž kolo po kole — kvalifikace, semifinále, finále. Detaily průběhu, reakce publika, dramatické momenty.",
};

async function generateDisciplineNarrative(
  discName: string,
  discEmoji: string,
  cfg: DiscConfig,
  qualStandings: any[],
  semiStandings: any[],
  finalStandings: any[],
  rollDiff: number,
): Promise<string[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return [`${discEmoji} ${discName} — výsledky jsou zapsány.`];

  const qualElim = qualStandings.filter(s => s.eliminated);
  const semiElim = semiStandings.filter(s => s.eliminated);
  const winner = finalStandings[0];
  const runnerUp = finalStandings[1];
  const tension = rollDiff < 3 ? "EXTRÉMNĚ TĚSNÉ — rozhodují setiny/detaily" : rollDiff < 8 ? "Těsné — jasný souboj dvou nejlepších" : rollDiff < 15 ? "Jasná převaha vítěze" : "Dominantní výkon vítěze";

  const styleInstructions = cfg.category === "physical"
    ? `STYL: Kvalifikaci a semifinále piš jako kronikář (3. osoba, střízlivý tón). Finále piš jako ŽIVÝ KOMENTÁŘ — krátké, úsečné věty, zvolání, napětí, přítomný čas. "Theron zrychluje! Nikias ztrácí kontakt!"`
    : cfg.category === "cultural"
    ? `STYL: Popiš KONKRÉTNÍ díla/výkony (co básník říká, co socha zobrazuje, jaký argument filosof použil). Popiš reakce poroty — jména porotců, jejich komentáře, gesta. Kombinuj umělecký popis s pohledem publika a poroty.`
    : `STYL: Piš jako válečný zpravodaj. Kvalifikaci suše, semifinále s narůstajícím napětím. Finále detailně — konkrétní manévry, rozhodnutí, reakce přihlížejících generálů.`;

  const prompt = `Jsi kronikář starověkých her. Napiš DETAILNÍ reportáž disciplíny "${discName}" v češtině.

${cfg.narrativePrompt}

${styleInstructions}

PRAVIDLA:
- Napiš PŘESNĚ 10-15 řádků (oddělených \\n).
- Každý řádek je samostatná narativní věta nebo komentář.
- Kvalifikace: 2-3 řádky. Semifinále: 2-3 řádky. Finále: 4-6 řádků (nejvíce detailů).
- Výsledkový řádek na konci: "${discEmoji} VÍTĚZ: ${winner?.name} (${winner?.player})"
- Používej jména sportovců a jejich říší přesně jak jsou uvedena.
- NEPOUŽÍVEJ markdown formátování (žádné **, ##, atd.). Jen čistý text.

ÚČASTNÍCI A VÝSLEDKY:
Kvalifikace (${qualStandings.length} účastníků):
${qualStandings.map((s, i) => `  ${i+1}. ${s.name} (${s.player}) — skóre ${s.score}${s.eliminated ? " ❌ VYŘAZEN" : " ✅"}`).join("\n")}

Semifinále (${semiStandings.length} účastníků):
${semiStandings.map((s, i) => `  ${i+1}. ${s.name} (${s.player}) — skóre ${s.score}${s.eliminated ? " ❌ VYŘAZEN" : " ✅"}`).join("\n")}

Finále (${finalStandings.length} účastníků):
${finalStandings.map((s, i) => `  ${i+1}. ${s.name} (${s.player}) — skóre ${s.score} ${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""}`).join("\n")}

Napětí finále: ${tension} (rozdíl skóre: ${rollDiff.toFixed(1)})

Odpověz POUZE textem reportáže, každý řádek na novém řádku. Žádný JSON, žádné uvozovky.`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
      }),
    });
    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content?.trim();
      if (content) {
        const lines = content.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        if (lines.length >= 3) return lines;
      }
    }
  } catch (e) {
    console.error(`AI narrative for ${discName} failed:`, e);
  }

  // Fallback: simple narrative
  return [
    `${discEmoji} ${discName} — soutěž začíná s ${qualStandings.length} účastníky.`,
    qualElim.length > 0 ? `Kvalifikace: ${qualElim.map(s => s.name).join(", ")} vypadávají.` : `Všichni prošli kvalifikací.`,
    semiElim.length > 0 ? `Semifinále: ${semiElim.map(s => s.name).join(", ")} nestačí tempu.` : `Semifinále bez překvapení.`,
    `Finále: ${winner?.name} vs ${runnerUp?.name} — ${tension.toLowerCase()}.`,
    `${discEmoji} VÍTĚZ: ${winner?.name} (${winner?.player})!`,
  ];
}

/**
 * games-resolve: Resolve all disciplines for a festival.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, festival_id, turn_number } = await req.json();

    if (!session_id || !festival_id) {
      return new Response(JSON.stringify({ error: "session_id, festival_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: festival } = await sb.from("games_festivals").select("*").eq("id", festival_id).single();
    if (!festival) {
      return new Response(JSON.stringify({ error: "Festival nenalezen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (festival.status === "concluded") {
      return new Response(JSON.stringify({ error: "Festival již skončil" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count: existingResults } = await sb.from("games_results")
      .select("id", { count: "exact", head: true }).eq("festival_id", festival_id);
    if (existingResults && existingResults > 0) {
      return new Response(JSON.stringify({ error: "Hry již byly vyhodnoceny" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: participants } = await sb.from("games_participants").select("*").eq("festival_id", festival_id);
    if (!participants || participants.length < 2) {
      return new Response(JSON.stringify({ error: "Nedostatek účastníků" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: disciplines } = await sb.from("games_disciplines").select("*");
    if (!disciplines) throw new Error("No disciplines found");

    const { data: intrigues } = await sb.from("games_intrigues")
      .select("*").eq("festival_id", festival_id).eq("success", true);

    const intrigueEffects = new Map<string, number>();
    for (const ig of (intrigues || [])) {
      if (ig.target_participant_id) {
        const current = intrigueEffects.get(ig.target_participant_id) || 0;
        if (ig.action_type === "sabotage") intrigueEffects.set(ig.target_participant_id, current - 15);
        if (ig.action_type === "sponsor") intrigueEffects.set(ig.target_participant_id, current + 10);
        if (ig.action_type === "bribe") intrigueEffects.set(ig.target_participant_id, current + 5);
      }
    }

    // ═══ LOAD ACADEMY STATS FOR HYBRID BONUS ═══
    const academyRepMap = new Map<string, number>(); 
    const academyFanBaseMap = new Map<string, number>();
    for (const p of participants) {
      if (!p.student_id) continue;
      try {
        const { data: stud } = await sb.from("academy_students").select("academy_id").eq("id", p.student_id).maybeSingle();
        if (stud?.academy_id) {
          const { data: acad } = await sb.from("academies").select("reputation, fan_base, crowd_popularity").eq("id", stud.academy_id).maybeSingle();
          if (acad) {
            academyRepMap.set(p.id, acad.reputation || 0);
            academyFanBaseMap.set(p.id, acad.fan_base || 0);
          }
        }
      } catch (_) {}
    }

    // ═══════════════════════════════════════════
    // RESOLVE EACH DISCIPLINE WITH 3 PHASES
    // ═══════════════════════════════════════════
    const allResults: any[] = [];
    const medalTally: Record<string, { gold: number; silver: number; bronze: number; player: string; participantId: string }> = {};
    const incidents: any[] = [];
    const revealScript: any[] = [];
    let feedSeq = 0;
    let revealSeq = 0;

    const writeFeed = async (type: string, text: string, drama: number = 1, discId?: string, partId?: string, roll?: number) => {
      feedSeq++;
      await sb.from("games_live_feed").insert({
        session_id, festival_id, discipline_id: discId || null,
        sequence_num: feedSeq, feed_type: type, text,
        participant_id: partId || null, roll_value: roll || null, drama_level: drama,
      });
    };

    const addReveal = (type: string, data: any, delayMs: number = 3000, drama: number = 2) => {
      revealSeq++;
      revealScript.push({ seq: revealSeq, type, delay_ms: delayMs, drama, ...data });
    };

    // Discipline-aware scoring
    function computeScore(p: any, disc: any, phaseVarianceMult: number = 1.0): number {
      const cfg = DISC_CONFIGS[disc.key] || DEFAULT_DISC_CONFIG;

      const primaryVal = (p as any)[disc.primary_stat] || 50;
      const secondaryVal = disc.secondary_stat ? (p as any)[disc.secondary_stat] || 50 : 50;
      const tertiaryStat = cfg.tertiaryStat || "endurance";
      const tertiaryVal = (p as any)[tertiaryStat] || 50;
      const allStats = [p.strength, p.endurance, p.agility, p.tactics, p.charisma];
      const avgStat = allStats.reduce((a: number, b: number) => a + b, 0) / allStats.length;

      const baseScore = primaryVal * cfg.primaryWeight + secondaryVal * cfg.secondaryWeight + tertiaryVal * cfg.tertiaryWeight + avgStat * 0.10;

      let bonus = 0;
      bonus += p.training_bonus * 0.5;
      bonus += p.city_infrastructure_bonus * 0.3;
      bonus += p.civ_modifier * 0.2;
      bonus += p.morale_modifier * cfg.moraleInfluence;

      // ═══ HYBRID ACADEMY BONUS (1-5%) ═══
      const academyRep = academyRepMap.get(p.id) || 0;
      bonus += baseScore * (academyRep / 100) * 0.05;

      if (p.form === "peak") bonus += 8;
      if (p.form === "tired") bonus -= 5;
      if (p.form === "injured") bonus -= 15;

      if (p.traits?.includes("Železný")) bonus += 5;
      if (p.traits?.includes("Křehký")) bonus -= 3;
      if (p.traits?.includes("Charismatický") && disc.category === "cultural") bonus += 8;
      if (p.traits?.includes("Odvážný") && disc.category === "physical") bonus += 5;
      if (p.traits?.includes("Stoický") && disc.category === "strategic") bonus += 6;
      bonus += intrigueEffects.get(p.id) || 0;

      // Luck (variance)
      const varianceRange = baseScore * cfg.luckFactor * phaseVarianceMult;
      const variance = (Math.random() - 0.5) * 2 * varianceRange;
      return baseScore + bonus + variance;
    }

    // ═══ OPENING CEREMONY ═══
    addReveal("ceremony_open", {
      text: "Slavnostní oheň byl zapálen! Hry začínají.",
      location: festival.host_city_id ? "Hostitelské město" : "Aréna",
    }, 4000);

    for (const disc of disciplines) {
      const cfg = DISC_CONFIGS[disc.key] || DEFAULT_DISC_CONFIG;
      // All participants compete in all disciplines (no disciplines column on participants)
      const discParts = [...participants];
      if (discParts.length < 2) continue;

      // 1. QUALIFICATION
      const qualResults = discParts.map(p => ({
        ...p, score: Math.round(computeScore(p, disc, 1.2)),
        eliminated: false,
      })).sort((a, b) => b.score - a.score);

      // Elim half (min 2 remain)
      const survivorsCount = Math.max(2, Math.ceil(qualResults.length * 0.6));
      qualResults.forEach((p, i) => { if (i >= survivorsCount) p.eliminated = true; });

      // 2. SEMIFINALS
      const semiParts = qualResults.filter(p => !p.eliminated);
      const semiResults = semiParts.map(p => ({
        ...p, score: Math.round(computeScore(p, disc, 0.8)), // Less luck
      })).sort((a, b) => b.score - a.score);

      // Top 3 to finals (or 2 if only 2)
      const finalistsCount = Math.min(3, semiResults.length);
      semiResults.forEach((p, i) => { if (i >= finalistsCount) p.eliminated = true; });

      // 3. FINALS
      const finalists = semiResults.filter(p => !p.eliminated);
      const finalResults = finalists.map(p => ({
        ...p, score: Math.round(computeScore(p, disc, 0.5)), // Minimal luck
      })).sort((a, b) => b.score - a.score);

      // Determine medalists
      const gold = finalResults[0];
      const silver = finalResults[1];
      const bronze = finalResults[2];

      const rollDiff = gold && silver ? gold.score - silver.score : 10;

      // Generate AI Narrative
      const narrativeLines = await generateDisciplineNarrative(
        disc.name, disc.icon_emoji, cfg,
        qualResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score, eliminated: p.eliminated })),
        semiResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score, eliminated: p.eliminated })),
        finalResults.map(p => ({ name: p.athlete_name, player: p.player_name, score: p.score })),
        rollDiff
      );

      // Save results to DB
      for (const res of finalResults) {
        let medal = null;
        let points = 0;
        if (res === gold) { medal = "gold"; points = 5; }
        else if (res === silver) { medal = "silver"; points = 3; }
        else if (res === bronze) { medal = "bronze"; points = 1; }

        allResults.push({
          session_id, festival_id, discipline_id: disc.id, participant_id: res.id,
          total_score: res.score, rank: finalResults.indexOf(res) + 1, medal,
        });

        if (points > 0) {
          if (!medalTally[res.id]) medalTally[res.id] = { gold: 0, silver: 0, bronze: 0, player: res.player_name, participantId: res.id };
          if (medal === "gold") medalTally[res.id].gold++;
          if (medal === "silver") medalTally[res.id].silver++;
          if (medal === "bronze") medalTally[res.id].bronze++;
        }
      }

      // Add to Reveal Script
      addReveal("discipline_intro", {
        discipline: disc.name, icon: disc.icon_emoji, category: disc.category,
        participantCount: discParts.length,
      }, 3000);

      // Stream lines
      for (const line of narrativeLines) {
        addReveal("narrative_line", { text: line }, 2500 + line.length * 20);
      }

      // Medal reveal
      addReveal("discipline_result", {
        discipline: disc.name,
        gold: gold ? { name: gold.athlete_name, player: gold.player_name, score: gold.score } : null,
        silver: silver ? { name: silver.athlete_name, player: silver.player_name, score: silver.score } : null,
        bronze: bronze ? { name: bronze.athlete_name, player: bronze.player_name, score: bronze.score } : null,
      }, 5000);
    }

    // ═══ COMPUTE CHAMPION ═══
    let championId = null;
    let maxPoints = -1;
    const sortedTally = Object.values(medalTally).sort((a, b) => {
      const pA = a.gold * 5 + a.silver * 3 + a.bronze * 1;
      const pB = b.gold * 5 + b.silver * 3 + b.bronze * 1;
      return pB - pA;
    });

    if (sortedTally.length > 0) {
      championId = sortedTally[0].participantId;
      addReveal("champion_announce", {
        name: sortedTally[0].player, // Player name (empire)
        athleteName: participants.find(p => p.id === championId)?.athlete_name,
        medals: sortedTally[0]
      }, 6000, 3);
    }

    addReveal("ceremony_close", { text: "Hry jsou u konce. Sláva vítězům!" }, 4000);

    // Write all results to DB
    if (allResults.length > 0) {
      await sb.from("games_results").insert(allResults);
    }

    // Update festival status
    await sb.from("games_festivals").update({
      status: "concluded", concluded_turn: turn_number,
      best_athlete_id: championId,
      reveal_script: revealScript, // SAVE SCRIPT TO DB
    }).eq("id", festival_id);

    // Create legends
    const legends = [];
    if (championId) {
      legends.push(championId);
    }

    // ═══ WIKI PROPAGATION — delegate to shared function ═══
    try {
      await sb.functions.invoke("games-wiki-propagate", {
        body: { session_id, festival_id },
      });
    } catch (wikiErr) {
      console.error("Wiki propagation for games error:", wikiErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      reveal_script: revealScript,
      legends,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("games-resolve error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
