import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * academy-tick: Called each turn from commit-turn.
 *
 * 1. Auto-create academies from qualifying buildings (aréna, stadion, akademie)
 * 2. Deduct sport_funding from gold_reserve
 * 3. Run training cycles — generate graduates from mature academies
 * 4. Update academy stats based on funding + events
 *
 * Input: { session_id, player_name, turn_number }
 */

const ACADEMY_BUILDING_KEYWORDS = ["aréna", "arena", "stadion", "akademi", "gymnasium", "škola", "school", "colosseum", "koloseum"];
const TRAINING_CYCLE = 5; // turns between graduations

const ATHLETE_NAMES = [
  "Aethon", "Kallistos", "Lykaon", "Theron", "Nikias", "Demetrios", "Kassandros",
  "Herakleidos", "Agathos", "Philon", "Solon", "Kyros", "Andronikos", "Timotheos",
  "Ariston", "Leontios", "Xenophon", "Ptolemaios", "Diogenes", "Epikouros",
  "Althaia", "Kassandra", "Elektra", "Atalanta", "Artemis", "Hypatia", "Korinna",
  "Aspasia", "Sappho", "Antigone", "Medea", "Penelope", "Kalliope", "Xanthippe",
];

const SPECIALTIES = ["sprint", "endurance", "combat", "rhetoric", "tactics", "archery", "wrestling", "strategy"];

const TRAITS_POOL = [
  "Železný", "Křehký", "Zbožný", "Nervózní", "Charismatický", "Lstivý",
  "Odvážný", "Stoický", "Hbitý", "Neúnavný", "Divoch", "Rozvážný",
];

// Civ orientation modifiers for school profiles
const CIV_PROFILE_MODS: Record<string, { athletics: number; combat: number; culture: number; strategy: number; brutality: number }> = {
  feudal:       { athletics: 0,  combat: 10,  culture: -5,  strategy: 10,  brutality: 5 },
  tribal:       { athletics: 10, combat: 5,   culture: -10, strategy: 0,   brutality: 10 },
  theocratic:   { athletics: 5,  combat: 0,   culture: 15,  strategy: 5,   brutality: -10 },
  mercantile:   { athletics: 10, combat: 0,   culture: 5,   strategy: 10,  brutality: 0 },
  militaristic: { athletics: 0,  combat: 20,  culture: -10, strategy: 10,  brutality: 15 },
  democratic:   { athletics: 10, combat: -5,  culture: 15,  strategy: 5,   brutality: -10 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, turn_number } = await req.json();
    if (!session_id || !player_name) {
      return new Response(JSON.stringify({ error: "session_id, player_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const turn = turn_number || 1;
    const results: any = { academies_created: 0, students_graduated: 0, funding_deducted: 0 };

    // ═══════════════════════════════════════════
    // 1. AUTO-CREATE ACADEMIES FROM BUILDINGS
    // ═══════════════════════════════════════════
    // Find completed buildings that look like academies/arenas and don't have an academy yet
    const { data: buildings } = await sb.from("city_buildings")
      .select("id, name, city_id, session_id, category, description, effects")
      .eq("session_id", session_id)
      .eq("status", "completed");

    const { data: existingAcademies } = await sb.from("academies")
      .select("building_id")
      .eq("session_id", session_id)
      .eq("player_name", player_name);

    const linkedBuildingIds = new Set((existingAcademies || []).map(a => a.building_id).filter(Boolean));

    // Get civ identity for profile modifiers
    const { data: civId } = await sb.from("civ_identity")
      .select("society_structure, military_doctrine, culture_tags")
      .eq("session_id", session_id).eq("player_name", player_name).maybeSingle();

    const civMods = CIV_PROFILE_MODS[civId?.society_structure || ""] || { athletics: 0, combat: 0, culture: 0, strategy: 0, brutality: 0 };

    // Get cities owned by this player
    const { data: playerCities } = await sb.from("cities")
      .select("id, owner_player")
      .eq("session_id", session_id).eq("owner_player", player_name);

    const playerCityIds = new Set((playerCities || []).map(c => c.id));

    for (const bldg of (buildings || [])) {
      if (linkedBuildingIds.has(bldg.id)) continue;
      if (!playerCityIds.has(bldg.city_id)) continue;

      const nameLC = bldg.name.toLowerCase();
      const descLC = (bldg.description || "").toLowerCase();
      const isAcademyBuilding = ACADEMY_BUILDING_KEYWORDS.some(kw => nameLC.includes(kw) || descLC.includes(kw));
      if (!isAcademyBuilding) continue;

      // Determine base profile from building category/name
      let baseProfile = { athletics: 50, combat: 30, culture: 20, strategy: 10, brutality: 5 };
      if (nameLC.includes("aréna") || nameLC.includes("arena") || nameLC.includes("colosseum") || nameLC.includes("koloseum")) {
        baseProfile = { athletics: 30, combat: 50, culture: 10, strategy: 15, brutality: 40 };
      } else if (nameLC.includes("akademi") || nameLC.includes("škola") || nameLC.includes("school")) {
        baseProfile = { athletics: 30, combat: 10, culture: 50, strategy: 40, brutality: 0 };
      } else if (nameLC.includes("gymnasium")) {
        baseProfile = { athletics: 60, combat: 20, culture: 15, strategy: 15, brutality: 5 };
      }

      // Apply civ modifiers (clamped 0-100)
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const profile = {
        athletics: clamp(baseProfile.athletics + civMods.athletics),
        combat: clamp(baseProfile.combat + civMods.combat),
        culture: clamp(baseProfile.culture + civMods.culture),
        strategy: clamp(baseProfile.strategy + civMods.strategy),
        brutality: clamp(baseProfile.brutality + civMods.brutality),
      };

      const academyName = `Akademie ${bldg.name}`;
      await sb.from("academies").insert({
        session_id,
        city_id: bldg.city_id,
        player_name,
        name: academyName,
        building_id: bldg.id,
        profile_athletics: profile.athletics,
        profile_combat: profile.combat,
        profile_culture: profile.culture,
        profile_strategy: profile.strategy,
        profile_brutality: profile.brutality,
        founded_turn: turn,
        last_training_turn: turn,
        reputation: 10 + Math.floor(Math.random() * 10),
        infrastructure: 10 + Math.floor(Math.random() * 15),
        trainer_level: 10 + Math.floor(Math.random() * 10),
        nutrition: 10 + Math.floor(Math.random() * 10),
      });

      // Log event
      await sb.from("game_events").insert({
        session_id,
        event_type: "school_formed",
        note: `${academyName} byla založena ve městě díky budově ${bldg.name}. Nová generace atletů a učenců se začíná formovat.`,
        player: player_name,
        turn_number: turn,
        confirmed: true,
        reference: { building_id: bldg.id, city_id: bldg.city_id, academy_name: academyName },
      });

      results.academies_created++;
    }

    // ═══════════════════════════════════════════
    // 2. SPORT FUNDING — DEDUCT FROM GOLD
    // ═══════════════════════════════════════════
    const { data: realm } = await sb.from("realm_resources")
      .select("id, gold_reserve, sport_funding_pct")
      .eq("session_id", session_id).eq("player_name", player_name).maybeSingle();

    if (realm && realm.sport_funding_pct > 0 && realm.gold_reserve > 0) {
      // Gold deduction is handled by process-turn; here we only compute boost amount
      const fundingAmount = Math.floor(realm.gold_reserve * realm.sport_funding_pct / 100);
      if (fundingAmount > 0) {
        results.funding_deducted = fundingAmount;

        // Boost all player's academies based on funding
        const { data: myAcademies } = await sb.from("academies")
          .select("id, reputation, infrastructure, nutrition, trainer_level")
          .eq("session_id", session_id).eq("player_name", player_name).eq("status", "active");

        if (myAcademies && myAcademies.length > 0) {
          const perSchool = Math.floor(fundingAmount / myAcademies.length);
          for (const acad of myAcademies) {
            // Funding boosts: +1 infrastructure per 5 gold, +1 nutrition per 8 gold, +1 trainer per 10 gold
            const infraBoost = Math.min(5, Math.floor(perSchool / 5));
            const nutritionBoost = Math.min(3, Math.floor(perSchool / 8));
            const trainerBoost = Math.min(2, Math.floor(perSchool / 10));

            await sb.from("academies").update({
              infrastructure: Math.min(100, acad.infrastructure + infraBoost),
              nutrition: Math.min(100, acad.nutrition + nutritionBoost),
              trainer_level: Math.min(100, acad.trainer_level + trainerBoost),
            }).eq("id", acad.id);
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    // 3. TRAINING CYCLES — GENERATE GRADUATES
    // ═══════════════════════════════════════════
    const { data: academies } = await sb.from("academies")
      .select("*")
      .eq("session_id", session_id).eq("player_name", player_name).eq("status", "active");

    for (const acad of (academies || [])) {
      const turnsSinceLast = turn - acad.last_training_turn;
      if (turnsSinceLast < acad.training_cycle_turns) continue;

      // Generate 1-3 students
      const studentCount = 1 + Math.floor(Math.random() * 2) + (acad.infrastructure > 50 ? 1 : 0);

      for (let i = 0; i < studentCount; i++) {
        const name = ATHLETE_NAMES[Math.floor(Math.random() * ATHLETE_NAMES.length)];

        // Quality formula: School stats weighted
        const baseQuality =
          acad.reputation * 0.4 +
          acad.infrastructure * 0.2 +
          acad.trainer_level * 0.2 +
          acad.nutrition * 0.1;
        const variance = Math.floor(Math.random() * 20) - 10; // ±10

        // Distribute stats based on school profile
        const totalProfile = acad.profile_athletics + acad.profile_combat + acad.profile_culture + acad.profile_strategy;
        const normalize = (v: number) => v / Math.max(totalProfile, 1);

        const statBase = baseQuality + variance;
        const clampStat = (v: number) => Math.max(10, Math.min(99, Math.floor(v)));

        // Athletics → endurance + agility, Combat → strength, Culture → charisma, Strategy → tactics
        const strength = clampStat(statBase * (0.5 + normalize(acad.profile_combat) * 0.8) + Math.random() * 15);
        const endurance = clampStat(statBase * (0.5 + normalize(acad.profile_athletics) * 0.8) + Math.random() * 15);
        const agility = clampStat(statBase * (0.4 + normalize(acad.profile_athletics) * 0.6) + Math.random() * 15);
        const tactics = clampStat(statBase * (0.4 + normalize(acad.profile_strategy) * 0.8) + Math.random() * 15);
        const charisma = clampStat(statBase * (0.3 + normalize(acad.profile_culture) * 0.8) + Math.random() * 15);

        // Specialty based on highest profile
        const profiles = [
          { key: "sprint", val: acad.profile_athletics },
          { key: "combat", val: acad.profile_combat },
          { key: "rhetoric", val: acad.profile_culture },
          { key: "tactics", val: acad.profile_strategy },
        ];
        profiles.sort((a, b) => b.val - a.val);
        const specialty = profiles[0].key;

        const traits = [TRAITS_POOL[Math.floor(Math.random() * TRAITS_POOL.length)]];
        // Brutal schools add "Divoch" or risk injury
        if (acad.profile_brutality > 30 && Math.random() < acad.profile_brutality / 200) {
          traits.push("Divoch");
        }

        // Generate bio based on school and stats
        const topStat = [
          { s: "Síla", v: strength }, { s: "Výdrž", v: endurance },
          { s: "Obratnost", v: agility }, { s: "Taktika", v: tactics }, { s: "Charisma", v: charisma },
        ].sort((a, b) => b.v - a.v)[0];

        const bioFragments = [
          `Absolvent ${acad.name}, specialista na ${specialty}.`,
          `Vyniká v ${topStat.s.toLowerCase()} (${topStat.v}).`,
          traits.length > 0 ? `Vlastnosti: ${traits.join(", ")}.` : "",
        ].filter(Boolean);

        const bio = bioFragments.join(" ");

        // Generate portrait via AI
        let portraitUrl: string | null = null;
        try {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            const portraitPrompt = `Ancient Greek/Roman athlete portrait, ${name}, ${specialty} specialist, ${traits.join(", ")} personality. Athletic physique, historical setting, dramatic lighting. Oil painting style.`;
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [{ role: "user", content: portraitPrompt }],
                modalities: ["image", "text"],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              if (imageData) {
                portraitUrl = imageData;
              }
            }
          }
        } catch (portraitErr) {
          console.error("Portrait generation failed (non-critical):", portraitErr);
        }

        const { data: insertedStudent } = await sb.from("academy_students").insert({
          academy_id: acad.id,
          session_id,
          player_name,
          name,
          strength, endurance, agility, tactics, charisma,
          specialty,
          traits,
          training_started_turn: turn - acad.training_cycle_turns,
          graduation_turn: turn,
          status: "graduated",
          bio,
          portrait_url: portraitUrl,
        }).select("id").single();

        results.students_graduated++;
      }

      // Update academy
      await sb.from("academies").update({
        last_training_turn: turn,
        total_graduates: acad.total_graduates + studentCount,
        // Reputation grows slightly with each cycle
        reputation: Math.min(100, acad.reputation + 1),
      }).eq("id", acad.id);

      // Fatality risk for brutal schools
      if (acad.profile_brutality > 40 && Math.random() < acad.profile_brutality / 300) {
        await sb.from("academies").update({
          total_fatalities: acad.total_fatalities + 1,
        }).eq("id", acad.id);

        await sb.from("game_events").insert({
          session_id,
          event_type: "arena_fatality",
          note: `Tragédie v ${acad.name}: student zahynul při brutálním výcviku. Veřejnost je šokována.`,
          player: player_name,
          turn_number: turn,
          confirmed: true,
          reference: { academy_id: acad.id, city_id: acad.city_id },
        });
      }

      // ═══ GLADIATORIAL MECHANICS ═══
      if (acad.profile_brutality > 20) {
        // Mark as gladiatorial if brutality threshold met
        if (!acad.is_gladiatorial) {
          await sb.from("academies").update({ is_gladiatorial: true }).eq("id", acad.id);
        }

        // Update favor dynamics
        const peopleFavor = Math.min(100, Math.max(0,
          (acad.people_favor || 50) + (acad.total_graduates > 0 ? 2 : 0) - (acad.total_fatalities > 3 ? 3 : 0)
        ));
        const eliteFavor = Math.min(100, Math.max(0,
          (acad.elite_favor || 50) + (acad.profile_brutality > 60 ? -1 : 1)
        ));
        const crowdPop = Math.min(100, (acad.crowd_popularity || 0) + 1 + Math.floor(acad.profile_brutality / 30));
        
        // Revolt risk: high brutality + low elite favor + high people favor = rebellion
        const revoltRisk = Math.max(0, Math.min(100,
          Math.floor(acad.profile_brutality * 0.3 + (100 - eliteFavor) * 0.3 + peopleFavor * 0.2 - 30)
        ));

        await sb.from("academies").update({
          people_favor: peopleFavor,
          elite_favor: eliteFavor,
          crowd_popularity: crowdPop,
          revolt_risk: revoltRisk,
        }).eq("id", acad.id);

        // Gladiator revolt event
        if (revoltRisk > 80 && Math.random() < 0.15) {
          await sb.from("game_events").insert({
            session_id,
            event_type: "gladiator_revolt",
            note: `Vzpoura gladiátorů v ${acad.name}! Ozbrojení bojovníci se obrátili proti svým pánům. Stabilita města klesá.`,
            player: player_name,
            turn_number: turn,
            confirmed: true,
            reference: { academy_id: acad.id, city_id: acad.city_id, revolt_risk: revoltRisk },
          });

          // Reduce city stability
          const { data: city } = await sb.from("cities")
            .select("id, city_stability").eq("id", acad.city_id).maybeSingle();
          if (city) {
            await sb.from("cities").update({
              city_stability: Math.max(0, city.city_stability - 15),
            }).eq("id", city.id);
          }

          // Reset revolt risk
          await sb.from("academies").update({ revolt_risk: 10 }).eq("id", acad.id);
          results.gladiator_revolts = (results.gladiator_revolts || 0) + 1;
        }

        // Religious crisis if brutality too high + clerics present
        if (acad.profile_brutality > 70 && Math.random() < 0.05) {
          await sb.from("game_events").insert({
            session_id,
            event_type: "religious_crisis",
            note: `Duchovní vůdci odsoudili brutalitu v ${acad.name}. Náboženské frakce žádají zákaz krvavých her.`,
            player: player_name,
            turn_number: turn,
            confirmed: true,
            reference: { academy_id: acad.id, brutality: acad.profile_brutality },
          });
        }
      }
    }

    // ═══════════════════════════════════════════
    // 4. UPDATE ACADEMY RANKINGS
    // ═══════════════════════════════════════════
    const { data: allAcademies } = await sb.from("academies")
      .select("id, reputation, total_graduates, total_champions, infrastructure, trainer_level, nutrition, corruption")
      .eq("session_id", session_id).eq("status", "active");

    if (allAcademies && allAcademies.length > 0) {
      const scored = allAcademies.map(a => ({
        id: a.id,
        score: a.reputation * 3 + a.total_champions * 50 + a.total_graduates * 5 +
          (a.infrastructure + a.trainer_level + a.nutrition) * 0.5 - (a.corruption || 0) * 2,
      })).sort((a, b) => b.score - a.score);

      for (let i = 0; i < scored.length; i++) {
        await sb.from("academy_rankings").upsert({
          session_id,
          academy_id: scored[i].id,
          turn_number: turn,
          rank_position: i + 1,
          score: Math.round(scored[i].score),
          prestige: Math.max(0, 100 - i * 15),
        }, { onConflict: "academy_id,turn_number" });
      }
      results.rankings_updated = scored.length;
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("academy-tick error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
