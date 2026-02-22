import { supabase } from "@/integrations/supabase/client";

export interface SagaContextData {
  sessionId: string;
  entity: {
    id: string;
    name: string;
    type: string;
    owner: string;
    tags: string[];
    extra: Record<string, any>;
    flavorPrompt: string | null;
    foundingLegend: string | null;
  };
  timeline: Array<{
    turn: number;
    eventId: string;
    title: string;
    summary: string;
    category?: string;
  }>;
  actors: Array<{
    name: string;
    role: string;
    type: string;
    faction: string;
  }>;
  relations: Record<string, any>;
  stats: Array<{
    stat_key: string;
    stat_value: string;
    stat_unit: string | null;
    source_turn: number;
  }>;
  chronicleNotes: Array<{
    id: string;
    text: string;
    turn_from: number | null;
    turn_to: number | null;
    epoch_style: string;
  }>;
  declarations: any[];
  // Extended sources
  rumors: Array<{
    text: string;
    tone_tag: string;
    turn_number: number;
    city_name: string;
  }>;
  worldEvents: Array<{
    id: string;
    title: string;
    summary: string;
    event_category: string;
    created_turn: number;
    tags: string[];
  }>;
  civilizationInfo: {
    civ_name: string;
    core_myth: string | null;
    cultural_quirk: string | null;
    architectural_style: string | null;
  } | null;
  diplomacySnippets: Array<{
    sender: string;
    message_text: string;
    message_tag: string | null;
  }>;
  // World narrative context
  worldNarrative: {
    loreBible: string | null;
    promptRules: any | null;
    worldSeed: string | null;
  };
  // Meta for UI
  sourceCounts: {
    events: number;
    actors: number;
    chronicles: number;
    stats: number;
    declarations: number;
    rumors: number;
    worldEvents: number;
    diplomacy: number;
  };
}

/**
 * Build a comprehensive SagaContext by querying all relevant DB records
 * for a given entity. This is the ONLY source of truth for saga generation.
 */
export async function buildSagaContext(
  sessionId: string,
  entityType: string,
  entityId: string,
  entityName: string,
  entity: any,
  allData: {
    countries: any[];
    regions: any[];
    provinces: any[];
    cities: any[];
    wonders: any[];
    persons: any[];
    events: any[];
    chronicles: any[];
    declarations: any[];
  }
): Promise<SagaContextData> {
  const owner = entity?.owner_player || entity?.player_name || entity?.ruler_player || "";
  const tags = entity?.tags || [];
  const flavorPrompt = entity?.flavor_prompt || null;

  // Fetch player's founding legend from wiki_entries
  let foundingLegend: string | null = null;
  {
    const { data: wikiRow } = await supabase
      .from("wiki_entries" as any)
      .select("body_md")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    foundingLegend = (wikiRow as any)?.body_md || null;
  }
  // Build extra entity info
  const extra: Record<string, any> = {};
  if (entityType === "city") {
    Object.assign(extra, {
      level: entity?.level, settlement_level: entity?.settlement_level,
      province: entity?.province, founded_round: entity?.founded_round,
      population: entity?.population_total, stability: entity?.city_stability,
      status: entity?.status,
    });
  } else if (entityType === "region") {
    Object.assign(extra, { biome: entity?.biome, description: entity?.description, is_homeland: entity?.is_homeland });
  } else if (entityType === "province") {
    Object.assign(extra, { description: entity?.description });
  } else if (entityType === "country") {
    Object.assign(extra, { description: entity?.description });
  } else if (entityType === "wonder") {
    Object.assign(extra, { era: entity?.era, status: entity?.status, city_name: entity?.city_name, description: entity?.description });
  } else if (entityType === "person") {
    Object.assign(extra, { person_type: entity?.person_type, flavor_trait: entity?.flavor_trait, bio: entity?.bio, born_round: entity?.born_round, died_round: entity?.died_round, is_alive: entity?.is_alive });
  }

  // 1) Collect related entity IDs (self + children + parent chain)
  const relatedEntityIds = new Set<string>([entityId]);
  const relations: Record<string, any> = {};
  const relatedCityIds = new Set<string>();

  if (entityType === "country") {
    const childRegions = allData.regions.filter(r => r.country_id === entityId);
    childRegions.forEach(r => relatedEntityIds.add(r.id));
    relations.regions = childRegions.map(r => ({ id: r.id, name: r.name }));
    const childProvinces = allData.provinces.filter(p => childRegions.some(r => r.id === p.region_id));
    childProvinces.forEach(p => relatedEntityIds.add(p.id));
    const childCities = allData.cities.filter(c => childProvinces.some(p => p.id === c.province_id));
    childCities.forEach(c => { relatedEntityIds.add(c.id); relatedCityIds.add(c.id); });
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "region") {
    const country = allData.countries.find(c => c.id === entity?.country_id);
    if (country) { relatedEntityIds.add(country.id); relations.country = { id: country.id, name: country.name }; }
    const childProvinces = allData.provinces.filter(p => p.region_id === entityId);
    childProvinces.forEach(p => relatedEntityIds.add(p.id));
    relations.provinces = childProvinces.map(p => ({ id: p.id, name: p.name }));
    const childCities = allData.cities.filter(c => childProvinces.some(p => p.id === c.province_id));
    childCities.forEach(c => { relatedEntityIds.add(c.id); relatedCityIds.add(c.id); });
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "province") {
    const region = allData.regions.find(r => r.id === entity?.region_id);
    if (region) { relatedEntityIds.add(region.id); relations.region = { id: region.id, name: region.name }; }
    const childCities = allData.cities.filter(c => c.province_id === entityId);
    childCities.forEach(c => { relatedEntityIds.add(c.id); relatedCityIds.add(c.id); });
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "city") {
    relatedCityIds.add(entityId);
    const province = allData.provinces.find(p => p.id === entity?.province_id);
    if (province) { relatedEntityIds.add(province.id); relations.province = { id: province.id, name: province.name }; }
    const cityWonders = allData.wonders.filter(w => w.city_name === entity?.name);
    cityWonders.forEach(w => relatedEntityIds.add(w.id));
    relations.wonders = cityWonders.map(w => ({ id: w.id, name: w.name }));
    const cityPersons = allData.persons.filter(p => p.city_id === entityId);
    cityPersons.forEach(p => relatedEntityIds.add(p.id));
    relations.persons = cityPersons.map(p => ({ id: p.id, name: p.name }));
  }

  // 2) Parallel DB queries — event links, stats, traits, rumors, world_events, civ, diplomacy
  const cityIdsArray = Array.from(relatedCityIds).slice(0, 50);
  const nameLC = entityName.toLowerCase();

  const [eventLinksRes, entityStatsRes, entityTraitsRes, rumorsRes, worldEventsRes, civRes, diplomacyRes, styleRes, sessionRes] = await Promise.all([
    supabase.from("event_entity_links").select("event_id, entity_id, entity_type, link_type")
      .eq("entity_id", entityId),
    supabase.from("entity_stats").select("*")
      .eq("session_id", sessionId).eq("entity_id", entityId)
      .order("source_turn", { ascending: true }),
    supabase.from("entity_traits").select("*")
      .eq("session_id", sessionId).eq("entity_id", entityId).eq("is_active", true),
    // Rumors from related cities
    cityIdsArray.length > 0
      ? supabase.from("city_rumors").select("text, tone_tag, turn_number, city_name")
          .eq("session_id", sessionId).in("city_id", cityIdsArray).eq("is_draft", false)
          .order("turn_number", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as any[], error: null }),
    // World events mentioning this entity
    supabase.from("world_events" as any).select("id, title, summary, event_category, created_turn, tags")
      .eq("session_id", sessionId).order("created_turn", { ascending: true }).limit(100),
    // Civilization info for the owner
    owner
      ? supabase.from("civilizations").select("civ_name, core_myth, cultural_quirk, architectural_style")
          .eq("session_id", sessionId).eq("player_name", owner).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Diplomacy snippets mentioning the entity or owner
    owner
      ? supabase.from("diplomacy_messages").select("sender, message_text, message_tag")
          .or(`message_text.ilike.%${entityName}%,sender.eq.${owner}`)
          .order("created_at", { ascending: false }).limit(15)
      : Promise.resolve({ data: [] as any[], error: null }),
    // World style settings (lore_bible, prompt_rules)
    supabase.from("game_style_settings").select("lore_bible, prompt_rules")
      .eq("session_id", sessionId).maybeSingle(),
    // Session info (world_seed)
    supabase.from("game_sessions").select("world_seed")
      .eq("id", sessionId).maybeSingle(),
  ]);

  const linkedEventIds = new Set((eventLinksRes.data || []).map(l => l.event_id));

  // Text-match events (by entity name in title/description)
  const textMatchedEvents = allData.events.filter(e =>
    e.title?.toLowerCase().includes(nameLC) || e.description?.toLowerCase().includes(nameLC)
  );
  textMatchedEvents.forEach(e => linkedEventIds.add(e.id));

  // Also add events from children
  const idsArray = Array.from(relatedEntityIds);
  if (idsArray.length > 1) {
    const { data: childLinks } = await supabase.from("event_entity_links").select("event_id")
      .in("entity_id", idsArray.slice(0, 50));
    (childLinks || []).forEach(l => linkedEventIds.add(l.event_id));
  }

  // Build timeline from matched events
  const timeline = allData.events
    .filter(e => linkedEventIds.has(e.id))
    .sort((a, b) => (a.created_turn || 0) - (b.created_turn || 0))
    .map(e => ({
      turn: e.created_turn || 0,
      eventId: e.id,
      title: e.title || "Bez názvu",
      summary: e.description?.slice(0, 200) || "",
      category: e.event_category || "",
    }));

  // 3) Actors: persons + factions connected to this entity or its events
  const actorNames = new Set<string>();
  const actors: SagaContextData["actors"] = [];

  const linkedPersons = allData.persons.filter(p =>
    relatedEntityIds.has(p.city_id) || p.player_name === owner
  );
  linkedPersons.forEach(p => {
    if (!actorNames.has(p.name)) {
      actorNames.add(p.name);
      actors.push({ name: p.name, role: p.person_type || "Osobnost", type: "person", faction: p.player_name });
    }
  });

  (entityTraitsRes.data || []).forEach((t: any) => {
    if (t.entity_name && !actorNames.has(t.entity_name) && t.entity_type !== entityType) {
      actorNames.add(t.entity_name);
      actors.push({ name: t.entity_name, role: t.trait_category, type: t.entity_type, faction: "" });
    }
  });

  // 4) Chronicle notes that mention entity name
  const chronicleNotes = allData.chronicles
    .filter(ch => ch.text?.toLowerCase().includes(nameLC))
    .slice(0, 15)
    .map(ch => ({
      id: ch.id,
      text: ch.text,
      turn_from: ch.turn_from,
      turn_to: ch.turn_to,
      epoch_style: ch.epoch_style,
    }));

  // 5) Declarations
  const relatedDeclarations = allData.declarations
    .filter(d => {
      const targets = [...(d.target_city_ids || []), ...(d.target_empire_ids || [])];
      return targets.includes(entityId) || d.player_name === owner ||
        d.original_text?.toLowerCase().includes(nameLC) || d.epic_text?.toLowerCase().includes(nameLC);
    })
    .slice(0, 10);

  const stats = (entityStatsRes.data || []).map((s: any) => ({
    stat_key: s.stat_key,
    stat_value: s.stat_value,
    stat_unit: s.stat_unit,
    source_turn: s.source_turn,
  }));

  // 6) Rumors
  const rumors = (rumorsRes.data || []).map((r: any) => ({
    text: r.text,
    tone_tag: r.tone_tag,
    turn_number: r.turn_number,
    city_name: r.city_name,
  }));

  // 7) World events filtered to those mentioning entity
  const worldEvents = (worldEventsRes.data || [])
    .filter((we: any) =>
      we.title?.toLowerCase().includes(nameLC) ||
      we.summary?.toLowerCase().includes(nameLC) ||
      (we.tags || []).some((t: string) => t.toLowerCase().includes(nameLC))
    )
    .slice(0, 20)
    .map((we: any) => ({
      id: we.id,
      title: we.title,
      summary: we.summary || "",
      event_category: we.event_category || "",
      created_turn: we.created_turn || 0,
      tags: we.tags || [],
    }));

  // 8) Civilization info
  const civilizationInfo = civRes.data ? {
    civ_name: (civRes.data as any).civ_name,
    core_myth: (civRes.data as any).core_myth,
    cultural_quirk: (civRes.data as any).cultural_quirk,
    architectural_style: (civRes.data as any).architectural_style,
  } : null;

  // 9) Diplomacy
  const diplomacySnippets = (diplomacyRes.data || []).map((d: any) => ({
    sender: d.sender,
    message_text: d.message_text?.slice(0, 200) || "",
    message_tag: d.message_tag,
  }));

  // 10) World narrative context
  const worldNarrative = {
    loreBible: (styleRes.data as any)?.lore_bible || null,
    promptRules: (() => { try { return JSON.parse((styleRes.data as any)?.prompt_rules || "null"); } catch { return null; } })(),
    worldSeed: (sessionRes.data as any)?.world_seed || null,
  };

  return {
    sessionId,
    entity: { id: entityId, name: entityName, type: entityType, owner, tags, extra, flavorPrompt, foundingLegend },
    timeline,
    actors,
    relations,
    stats,
    chronicleNotes,
    declarations: relatedDeclarations,
    rumors,
    worldEvents,
    civilizationInfo,
    diplomacySnippets,
    worldNarrative,
    sourceCounts: {
      events: timeline.length,
      actors: actors.length,
      chronicles: chronicleNotes.length,
      stats: stats.length,
      declarations: relatedDeclarations.length,
      rumors: rumors.length,
      worldEvents: worldEvents.length,
      diplomacy: diplomacySnippets.length,
    },
  };
}
