// ─────────────────────────────────────────────────────────────────────────────
// seed-realm-skeleton — synchronous physical-world seeder
//
// Creates the minimum playable realm right after generate-world-map:
//   • 1 country + 1 region + 1 province + 1 capital city per faction (player + AI)
//   • realm_resources + player_resources rows for each player
//   • Hex assignment from mapStartPositions filtered by terrain
//
// Stays narrative-free: the AI naratíva (persons, wonders, prehistory, etc.)
// runs in `world-generate-init` afterwards and only enriches existing entities.
// ─────────────────────────────────────────────────────────────────────────────

interface StartPos { q: number; r: number; }
interface FactionConfig { name?: string; personality?: string; description?: string; }

interface SeedRealmInput {
  sb: any;
  sessionId: string;
  playerName: string;
  worldName: string;
  premise: string;
  realmName?: string;
  cultureName?: string;
  settlementName?: string;
  // ── extended identity (single + manual modes) ──
  peopleName?: string;
  languageName?: string;
  civDescription?: string;
  homelandName?: string;
  homelandBiome?: string;
  homelandDesc?: string;
  rulerName?: string;
  rulerTitle?: string;
  rulerArchetype?: string;
  rulerBio?: string;
  governmentForm?: string;
  tradeIdeology?: string;
  dominantFaith?: string;
  faithAttitude?: string;
  heraldry?: { primary: string; secondary: string; symbol: string };
  secretObjectiveArchetype?: string;
  foundingLegend?: string;
  factions?: FactionConfig[];
  startPositions: StartPos[];
}

export interface SeedRealmResult {
  factionsSeeded: number;
  regionsSeeded: number;
  provincesSeeded: number;
  citiesSeeded: number;
  factionPlayerMap: Record<string, string>;
  cityIds: string[];
  /** ID seeded country pro hráče (pro downstream pipeline). */
  playerCountryId?: string;
}

const NEIGHBOR_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const CITY_BIOMES = new Set(["plains", "hills", "forest", "coastal", "grassland", "temperate", "savanna"]);

function hexRing(cq: number, cr: number, radius: number): StartPos[] {
  if (radius === 0) return [{ q: cq, r: cr }];
  const out: StartPos[] = [];
  let q = cq + NEIGHBOR_DIRS[4][0] * radius;
  let r = cr + NEIGHBOR_DIRS[4][1] * radius;
  for (let d = 0; d < 6; d++) {
    for (let s = 0; s < radius; s++) {
      out.push({ q, r });
      q += NEIGHBOR_DIRS[d][0]; r += NEIGHBOR_DIRS[d][1];
    }
  }
  return out;
}

export async function seedRealmSkeleton(input: SeedRealmInput): Promise<SeedRealmResult> {
  const {
    sb, sessionId, playerName, worldName, premise,
    realmName, cultureName, settlementName,
    peopleName, languageName, civDescription,
    homelandName, homelandBiome, homelandDesc,
    rulerName, rulerTitle, rulerArchetype, rulerBio,
    governmentForm, tradeIdeology, dominantFaith, faithAttitude,
    heraldry, secretObjectiveArchetype, foundingLegend,
    factions = [], startPositions,
  } = input;

  // Build the participant list: player first, then AI factions.
  const participants: Array<{ playerName: string; factionName: string; isPlayer: boolean; personality?: string }> = [
    {
      playerName,
      factionName: realmName || cultureName || `${playerName}ova říše`,
      isPlayer: true,
    },
    ...factions.map((f, i) => ({
      playerName: f.name || `AI Frakce ${i + 1}`,
      factionName: f.name || `AI Frakce ${i + 1}`,
      isPlayer: false,
      personality: f.personality,
    })),
  ];

  // Load terrain for placement.
  const { data: hexes } = await sb
    .from("province_hexes")
    .select("q, r, biome_family, is_passable, has_river")
    .eq("session_id", sessionId)
    .limit(8000);
  const terrainMap = new Map<string, { biome: string; passable: boolean; river: boolean }>();
  for (const h of hexes || []) {
    terrainMap.set(`${h.q},${h.r}`, {
      biome: String(h.biome_family || "plains"),
      passable: h.is_passable !== false,
      river: h.has_river === true,
    });
  }

  // Spread players across startPositions; if not enough, use radial fallback.
  const positions: StartPos[] = startPositions.length >= participants.length
    ? startPositions.slice(0, participants.length)
    : (() => {
        const out = [...startPositions];
        const step = 6;
        let i = 0;
        while (out.length < participants.length) {
          out.push({ q: Math.cos(i) * step * (1 + Math.floor(i / 6)) | 0, r: Math.sin(i) * step * (1 + Math.floor(i / 6)) | 0 });
          i++;
        }
        return out;
      })();

  const factionPlayerMap: Record<string, string> = {};
  const cityIds: string[] = [];
  let regionsSeeded = 0;
  let provincesSeeded = 0;
  let citiesSeeded = 0;
  let playerCountryId: string | undefined;

  // Build a richer description for the player country if identity is provided.
  const playerRulerLine = rulerName
    ? `${rulerTitle ? rulerTitle + " " : ""}${rulerName}${rulerArchetype ? ` (${rulerArchetype})` : ""}`
    : "";
  const playerCountryDesc = [
    civDescription || `Říše hráče ${playerName}: ${premise.slice(0, 240)}`,
    rulerName ? `Vládce: ${playerRulerLine}.` : "",
    governmentForm ? `Forma vlády: ${governmentForm}.` : "",
    dominantFaith ? `Dominantní víra: ${dominantFaith} (${faithAttitude || "tolerant"}).` : "",
  ].filter(Boolean).join(" ");

  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const center = positions[idx];
    factionPlayerMap[p.factionName] = p.playerName;

    // Country
    const aiFlavor = !p.isPlayer ? factions[idx - 1]?.description : "";
    const { data: country } = await sb.from("countries").insert({
      session_id: sessionId,
      name: p.factionName,
      ruler_player: p.playerName,
      description: p.isPlayer
        ? playerCountryDesc
        : (aiFlavor && aiFlavor.trim().length > 0
            ? `${p.factionName} — ${aiFlavor.trim()}`
            : `${p.factionName} — AI frakce ve světě ${worldName}.`),
      motto: p.isPlayer ? (foundingLegend ? foundingLegend.split(/[.!?]/)[0].slice(0, 80) : "Za slávu a kroniku") : "Vlastní cestou",
    }).select("id").single();
    if (p.isPlayer && country?.id) playerCountryId = country.id;

    // Region
    const regionName = p.isPlayer
      ? (homelandName?.trim() || `Země ${realmName || playerName}`)
      : `Země ${p.factionName}`;
    const regionDesc = p.isPlayer && homelandDesc?.trim()
      ? homelandDesc.trim()
      : `Domovský region ${p.factionName}.`;
    const regionBiome = p.isPlayer && homelandBiome
      ? homelandBiome
      : (terrainMap.get(`${center.q},${center.r}`)?.biome || "plains");
    const { data: region } = await sb.from("regions").insert({
      session_id: sessionId,
      name: regionName,
      description: regionDesc,
      biome: regionBiome,
      owner_player: p.playerName,
      is_homeland: true,
      discovered_turn: 1,
      discovered_by: p.playerName,
      country_id: country?.id ?? null,
    }).select("id").single();
    if (region) regionsSeeded++;

    // Province
    const provinceName = `${regionName} – Centrální`;
    const { data: province } = await sb.from("provinces").insert({
      session_id: sessionId,
      name: provinceName,
      description: `Hlavní provincie regionu ${regionName}.`,
      region_id: region?.id ?? null,
      owner_player: p.playerName,
      center_q: center.q,
      center_r: center.r,
      color_index: idx,
      is_neutral: false,
    }).select("id").single();
    if (province) provincesSeeded++;

    // Assign hexes (center + 2 rings, only land + passable + no river).
    const candidates = [center, ...hexRing(center.q, center.r, 1), ...hexRing(center.q, center.r, 2), ...hexRing(center.q, center.r, 3)];
    const valid = candidates.filter(c => {
      const t = terrainMap.get(`${c.q},${c.r}`);
      return t && t.passable && !t.river;
    }).slice(0, 19);
    if (province?.id && valid.length > 0) {
      for (const h of valid) {
        await sb.from("province_hexes")
          .update({ province_id: province.id, owner_player: p.playerName })
          .eq("session_id", sessionId).eq("q", h.q).eq("r", h.r);
      }
    }

    // Find a city-suitable hex.
    let cityHex = center;
    for (const c of valid) {
      const t = terrainMap.get(`${c.q},${c.r}`);
      if (t && CITY_BIOMES.has(t.biome)) { cityHex = c; break; }
    }

    const cityName = p.isPlayer && settlementName ? settlementName : (p.isPlayer ? `${playerName}grad` : `${p.factionName} – Hlavní`);
    const { data: city } = await sb.from("cities").insert({
      session_id: sessionId,
      name: cityName,
      owner_player: p.playerName,
      level: "Osada",
      tags: ["capital", "starting"],
      province: provinceName,
      province_id: province?.id ?? null,
      city_description_cached: `Hlavní osada ${p.factionName}.`,
      flavor_prompt: `Hlavní osada ${p.factionName} ve světě ${worldName}.`,
      founded_round: 1,
      province_q: cityHex.q,
      province_r: cityHex.r,
      city_stability: 65,
      // ENGINE OVERRIDE — startovní osada je VŽDY hamlet o 100 rolnících.
      // Žádní burghers/clerics na startu. Růst probíhá až přes engine ticky.
      population_total: 100,
      population_peasants: 100,
      population_burghers: 0,
      population_clerics: 0,
      settlement_level: "HAMLET",
    }).select("id").single();
    if (city) { cityIds.push(city.id); citiesSeeded++; }

    // Seed realm_resources (idempotent: skip if exists)
    const { data: existingRR } = await sb.from("realm_resources")
      .select("id").eq("session_id", sessionId).eq("player_name", p.playerName).maybeSingle();
    if (!existingRR) {
      await sb.from("realm_resources").insert({
        session_id: sessionId,
        player_name: p.playerName,
        grain_reserve: 30,
        wood_reserve: 10,
        stone_reserve: 5,
        iron_reserve: 2,
        production_reserve: 50,
        gold_reserve: 100,
        stability: 70,
        granary_capacity: 500,
        mobilization_rate: 0.1,
      });
    }

    // Seed legacy player_resources (food/wood/stone/iron/wealth)
    const baseIncome: Record<string, number> = { food: 6, wood: 4, stone: 3, iron: 2, wealth: 3 };
    const baseUpkeep: Record<string, number> = { food: 3, wood: 1, stone: 0, iron: 0, wealth: 1 };
    const baseStock:  Record<string, number> = { food: 20, wood: 10, stone: 5, iron: 3, wealth: 10 };
    for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
      const { data: existing } = await sb.from("player_resources")
        .select("id").eq("session_id", sessionId).eq("player_name", p.playerName).eq("resource_type", rt).maybeSingle();
      if (!existing) {
        await sb.from("player_resources").insert({
          session_id: sessionId, player_name: p.playerName, resource_type: rt,
          income: baseIncome[rt], upkeep: baseUpkeep[rt], stockpile: baseStock[rt],
        });
      }
    }

    // Ensure game_players row for AI factions.
    if (!p.isPlayer) {
      const { data: existingGP } = await sb.from("game_players")
        .select("id").eq("session_id", sessionId).eq("player_name", p.playerName).maybeSingle();
      if (!existingGP) {
        await sb.from("game_players").insert({
          session_id: sessionId,
          player_name: p.playerName,
          player_number: idx + 1,
        });
      }

      // Persist AI faction identity (name, personality, narrative flavor) to
      // civilizations table so AI faction-turn pipelines and chronicle
      // generators can read consistent flavor data.
      const aiFaction = factions[idx - 1]; // idx 0 = player, idx 1+ = factions[0+]
      try {
        await sb.from("civilizations").upsert({
          session_id: sessionId,
          player_name: p.playerName,
          civ_name: p.factionName,
          is_ai: true,
          ai_personality: p.personality || null,
          core_myth: aiFaction?.description || null,
          cultural_quirk: aiFaction?.personality || null,
        } as any, { onConflict: "session_id,player_name" });
      } catch (e) {
        console.warn("[seed-realm-skeleton] AI civilizations upsert failed:", e);
      }
    }
  }

  // ── Persist player identity to canonical tables (non-fatal) ──
  // civ_identity row enables extract-civ-identity-style downstream usage; even
  // empty bonuses are fine — the engine treats nulls as 0/baseline.
  try {
    const civDescForExtract = [
      civDescription,
      rulerName ? `Vládce: ${rulerTitle ? rulerTitle + " " : ""}${rulerName}${rulerArchetype ? ` (${rulerArchetype})` : ""}.` : "",
      governmentForm ? `Forma vlády: ${governmentForm}.` : "",
      tradeIdeology ? `Obchodní ideologie: ${tradeIdeology}.` : "",
      dominantFaith ? `Víra: ${dominantFaith} (${faithAttitude || "tolerant"}).` : "",
      foundingLegend ? `Zakladatelská legenda: ${foundingLegend}` : "",
    ].filter(Boolean).join(" ").trim();

    if (civDescForExtract.length > 0 || realmName) {
      await sb.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        display_name: realmName || `${playerName}ova říše`,
        flavor_summary: civDescription || foundingLegend?.slice(0, 200) || "",
        source_description: civDescForExtract,
        culture_tags: cultureName ? [cultureName] : [],
      } as any, { onConflict: "session_id,player_name" });
    }
  } catch (e) {
    console.warn("[seed-realm-skeleton] civ_identity upsert failed:", e);
  }

  // civilizations row — narrative metadata for the player's faction.
  try {
    if (realmName || rulerName || foundingLegend) {
      await sb.from("civilizations").upsert({
        session_id: sessionId,
        player_name: playerName,
        civ_name: realmName || `${playerName}ova říše`,
        core_myth: foundingLegend || null,
        cultural_quirk: cultureName || null,
        is_ai: false,
      } as any, { onConflict: "session_id,player_name" });
    }
  } catch (e) {
    console.warn("[seed-realm-skeleton] civilizations upsert failed:", e);
  }

  // player_civ_configs — store full identity so downstream AI pipelines (incl.
  // mp-style chronicles) can read consistent data for both SP and MP.
  try {
    await sb.from("player_civ_configs").upsert({
      session_id: sessionId,
      player_name: playerName,
      realm_name: realmName || null,
      settlement_name: settlementName || null,
      people_name: peopleName || null,
      culture_name: cultureName || null,
      language_name: languageName || null,
      civ_description: civDescription || null,
      homeland_name: homelandName || null,
      homeland_biome: homelandBiome || null,
      homeland_desc: homelandDesc || null,
      ruler_name: rulerName || null,
      ruler_title: rulerTitle || null,
      ruler_archetype: rulerArchetype || null,
      ruler_bio: rulerBio || null,
      government_form: governmentForm || null,
      trade_ideology: tradeIdeology || null,
      dominant_faith: dominantFaith || null,
      faith_attitude: faithAttitude || null,
      heraldry: heraldry || null,
      secret_objective_archetype: secretObjectiveArchetype || null,
      founding_legend: foundingLegend || null,
    } as any, { onConflict: "session_id,player_name" });
  } catch (e) {
    console.warn("[seed-realm-skeleton] player_civ_configs upsert failed:", e);
  }

  return {
    factionsSeeded: participants.length,
    regionsSeeded,
    provincesSeeded,
    citiesSeeded,
    factionPlayerMap,
    cityIds,
    playerCountryId,
  };
}
