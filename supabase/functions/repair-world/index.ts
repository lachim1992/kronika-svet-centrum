/**
 * repair-world — Fixes broken sessions missing country, regions, AI factions.
 * 
 * Analyzes session data and creates missing structural entities:
 * 1. Countries — one per faction (human + AI)
 * 2. Regions — one per faction + neutral
 * 3. Links orphaned provinces to regions
 * 4. AI factions (if missing)
 * 5. Wiki entries for all created entities
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const log: string[] = [];
    const push = (msg: string) => { log.push(msg); console.log(`[repair-world] ${msg}`); };

    // Load session data
    const { data: session } = await sb.from("game_sessions").select("*").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const { data: foundation } = await sb.from("world_foundations").select("*").eq("session_id", sessionId).maybeSingle();
    const worldName = foundation?.world_name || session.world_name || "Neznámý svět";

    // Load existing entities
    const { data: countries } = await sb.from("countries").select("*").eq("session_id", sessionId);
    const { data: regions } = await sb.from("regions").select("*").eq("session_id", sessionId);
    const { data: provinces } = await sb.from("provinces").select("*").eq("session_id", sessionId);
    const { data: civs } = await sb.from("civilizations").select("*").eq("session_id", sessionId);
    const { data: aiFactions } = await sb.from("ai_factions").select("*").eq("session_id", sessionId);
    const { data: cities } = await sb.from("cities").select("*").eq("session_id", sessionId);

    const humanCivs = (civs || []).filter((c: any) => !c.is_ai);
    const aiCivs = (civs || []).filter((c: any) => c.is_ai);

    // Build a unified list of all faction names (human players + AI)
    const allFactionNames = new Set<string>();
    for (const civ of (civs || [])) allFactionNames.add(civ.player_name);
    for (const af of (aiFactions || [])) allFactionNames.add(af.faction_name);
    // Also check cities for any owner not yet known
    for (const city of (cities || [])) allFactionNames.add(city.owner_player);

    // ═══ 1. COUNTRIES — one per faction ═══
    const existingCountries = countries || [];
    const countryByRuler = new Map<string, string>();
    for (const c of existingCountries) {
      if (c.ruler_player) countryByRuler.set(c.ruler_player, c.id);
    }

    for (const factionName of allFactionNames) {
      if (countryByRuler.has(factionName)) {
        push(`Country exists for ${factionName}`);
        continue;
      }

      // Check if there's an unassigned country we can claim
      const unassigned = existingCountries.find((c: any) => !c.ruler_player && !countryByRuler.has(c.id));
      if (unassigned && existingCountries.length === 1 && allFactionNames.size > 1) {
        // Don't reuse the single shared country — create new ones
      }

      const civ = (civs || []).find((c: any) => c.player_name === factionName);
      const countryName = civ?.civ_name || factionName;
      push(`Creating country for ${factionName}: ${countryName}`);

      const { data: countryRow } = await sb.from("countries").insert({
        session_id: sessionId,
        name: `Říše ${countryName}`,
        description: `Suverénní stát frakce ${countryName}.`,
        ruler_player: factionName,
      }).select("id").single();

      if (countryRow) {
        countryByRuler.set(factionName, countryRow.id);
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "country", entity_id: countryRow.id,
          entity_name: `Říše ${countryName}`, owner_player: factionName,
          summary: `${countryName} — suverénní stát.`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "repair" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
      }
    }

    // ═══ 2. REGIONS — one per faction ═══
    const existingRegions = regions || [];
    const regionByOwner = new Map<string, string>();
    for (const r of existingRegions) {
      if (r.owner_player) regionByOwner.set(r.owner_player, r.id);
    }

    for (const factionName of allFactionNames) {
      if (regionByOwner.has(factionName)) {
        push(`Region exists for ${factionName}: ${existingRegions.find((r: any) => r.owner_player === factionName)?.name}`);
        continue;
      }

      const civ = (civs || []).find((c: any) => c.player_name === factionName);
      const regionName = `${civ?.civ_name || factionName} – Domovina`;
      const countryId = countryByRuler.get(factionName) || null;

      push(`Creating region for ${factionName}: ${regionName}`);
      const { data: regRow } = await sb.from("regions").insert({
        session_id: sessionId, name: regionName,
        description: `Domovský region frakce ${civ?.civ_name || factionName}.`,
        biome: "plains", owner_player: factionName,
        is_homeland: true, discovered_turn: 1, discovered_by: factionName,
        country_id: countryId,
      }).select("id").single();

      if (regRow) {
        regionByOwner.set(factionName, regRow.id);
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "region", entity_id: regRow.id,
          entity_name: regionName, owner_player: factionName,
          summary: `${regionName} — domovský region.`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "repair" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
      }
    }

    // ═══ 3. Link orphan provinces to regions ═══
    const allProvinces = provinces || [];
    const orphanProvs = allProvinces.filter((p: any) => !p.region_id);
    if (orphanProvs.length > 0) {
      push(`Fixing ${orphanProvs.length} orphan provinces...`);
      for (const prov of orphanProvs) {
        const matchedRegionId = regionByOwner.get(prov.owner_player);
        if (matchedRegionId) {
          await sb.from("provinces").update({ region_id: matchedRegionId }).eq("id", prov.id);
          push(`  → Linked "${prov.name}" to region of ${prov.owner_player}`);
        }
      }
    }

    // ═══ 4. Link regions to countries ═══
    const allRegionsNow = [...existingRegions];
    for (const reg of allRegionsNow) {
      if (!reg.country_id && reg.owner_player) {
        const countryId = countryByRuler.get(reg.owner_player);
        if (countryId) {
          await sb.from("regions").update({ country_id: countryId }).eq("id", reg.id);
          push(`  → Linked region "${reg.name}" to country of ${reg.owner_player}`);
        }
      }
    }

    // ═══ 5. AI Factions ═══
    const existingAI = aiFactions || [];
    if (existingAI.length === 0) {
      const targetAICount = Math.max(2, humanCivs.length);
      if (aiCivs.length > 0) {
        push(`Creating ai_factions entries for ${aiCivs.length} existing AI civs...`);
        for (const aiCiv of aiCivs) {
          const disposition: Record<string, number> = {};
          for (const hc of humanCivs) disposition[hc.player_name] = 0;
          await sb.from("ai_factions").insert({
            session_id: sessionId, faction_name: aiCiv.civ_name,
            personality: aiCiv.ai_personality || "diplomatic",
            disposition, goals: ["Přežití", "Obchod"], is_active: true,
          });
          push(`  → AI faction from civ: ${aiCiv.civ_name}`);
        }
      } else {
        push(`Creating ${targetAICount} AI factions from scratch...`);
        const aiNames = ["Stínová Liga", "Severní Klan", "Pouštní Nomádi", "Železná Gilda", "Mlžný Řád"];
        const personalities = ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"];
        for (let i = 0; i < targetAICount && i < aiNames.length; i++) {
          const disposition: Record<string, number> = {};
          for (const hc of humanCivs) disposition[hc.player_name] = 0;

          await sb.from("civilizations").insert({
            session_id: sessionId, player_name: aiNames[i],
            civ_name: aiNames[i], is_ai: true,
            ai_personality: personalities[i],
          });

          await sb.from("ai_factions").insert({
            session_id: sessionId, faction_name: aiNames[i],
            personality: personalities[i],
            disposition, goals: ["Přežití", "Expanze"], is_active: true,
          });

          for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
            await sb.from("player_resources").insert({
              session_id: sessionId, player_name: aiNames[i], resource_type: rt,
              income: rt === "food" ? 6 : rt === "wood" ? 4 : rt === "stone" ? 3 : rt === "iron" ? 2 : 3,
              upkeep: rt === "food" ? 3 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
              stockpile: rt === "food" ? 20 : rt === "wood" ? 10 : rt === "stone" ? 5 : rt === "iron" ? 3 : 10,
            });
          }

          await sb.from("realm_resources").insert({
            session_id: sessionId, player_name: aiNames[i],
            grain_reserve: 20, wood_reserve: 0, stone_reserve: 0, iron_reserve: 0,
            production_reserve: 50,
            gold_reserve: 100, stability: 70, granary_capacity: 500, mobilization_rate: 0.1,
          });

          push(`  → Created AI: ${aiNames[i]} (${personalities[i]})`);
        }
      }
    } else {
      push(`AI factions exist: ${existingAI.length}`);
    }

    push(`Repair complete.`);

    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("repair-world error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
