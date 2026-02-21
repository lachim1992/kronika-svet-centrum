import { supabase } from "@/integrations/supabase/client";

export interface SagaContextData {
  entity: {
    id: string;
    name: string;
    type: string;
    owner: string;
    tags: string[];
    extra: Record<string, any>;
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
  // Meta for UI
  sourceCounts: {
    events: number;
    actors: number;
    chronicles: number;
    stats: number;
    declarations: number;
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

  if (entityType === "country") {
    const childRegions = allData.regions.filter(r => r.country_id === entityId);
    childRegions.forEach(r => relatedEntityIds.add(r.id));
    relations.regions = childRegions.map(r => ({ id: r.id, name: r.name }));
    const childProvinces = allData.provinces.filter(p => childRegions.some(r => r.id === p.region_id));
    childProvinces.forEach(p => relatedEntityIds.add(p.id));
    const childCities = allData.cities.filter(c => childProvinces.some(p => p.id === c.province_id));
    childCities.forEach(c => relatedEntityIds.add(c.id));
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "region") {
    const country = allData.countries.find(c => c.id === entity?.country_id);
    if (country) { relatedEntityIds.add(country.id); relations.country = { id: country.id, name: country.name }; }
    const childProvinces = allData.provinces.filter(p => p.region_id === entityId);
    childProvinces.forEach(p => relatedEntityIds.add(p.id));
    relations.provinces = childProvinces.map(p => ({ id: p.id, name: p.name }));
    const childCities = allData.cities.filter(c => childProvinces.some(p => p.id === c.province_id));
    childCities.forEach(c => relatedEntityIds.add(c.id));
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "province") {
    const region = allData.regions.find(r => r.id === entity?.region_id);
    if (region) { relatedEntityIds.add(region.id); relations.region = { id: region.id, name: region.name }; }
    const childCities = allData.cities.filter(c => c.province_id === entityId);
    childCities.forEach(c => relatedEntityIds.add(c.id));
    relations.cities = childCities.map(c => ({ id: c.id, name: c.name }));
  } else if (entityType === "city") {
    const province = allData.provinces.find(p => p.id === entity?.province_id);
    if (province) { relatedEntityIds.add(province.id); relations.province = { id: province.id, name: province.name }; }
    const cityWonders = allData.wonders.filter(w => w.city_name === entity?.name);
    cityWonders.forEach(w => relatedEntityIds.add(w.id));
    relations.wonders = cityWonders.map(w => ({ id: w.id, name: w.name }));
    const cityPersons = allData.persons.filter(p => p.city_id === entityId);
    cityPersons.forEach(p => relatedEntityIds.add(p.id));
    relations.persons = cityPersons.map(p => ({ id: p.id, name: p.name }));
  }

  // 2) Find events by entity links + text search
  const [eventLinksRes, entityStatsRes, entityTraitsRes] = await Promise.all([
    supabase.from("event_entity_links").select("event_id, entity_id, entity_type, link_type")
      .eq("entity_id", entityId),
    supabase.from("entity_stats").select("*")
      .eq("session_id", sessionId).eq("entity_id", entityId)
      .order("source_turn", { ascending: true }),
    supabase.from("entity_traits").select("*")
      .eq("session_id", sessionId).eq("entity_id", entityId).eq("is_active", true),
  ]);

  const linkedEventIds = new Set((eventLinksRes.data || []).map(l => l.event_id));

  // Text-match events (by entity name in title/description)
  const nameLC = entityName.toLowerCase();
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

  // Persons linked to entity
  const linkedPersons = allData.persons.filter(p =>
    relatedEntityIds.has(p.city_id) || p.player_name === owner
  );
  linkedPersons.forEach(p => {
    if (!actorNames.has(p.name)) {
      actorNames.add(p.name);
      actors.push({ name: p.name, role: p.person_type || "Osobnost", type: "person", faction: p.player_name });
    }
  });

  // Traits as extra actor info
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

  return {
    entity: { id: entityId, name: entityName, type: entityType, owner, tags, extra },
    timeline,
    actors,
    relations,
    stats,
    chronicleNotes,
    declarations: relatedDeclarations,
    sourceCounts: {
      events: timeline.length,
      actors: actors.length,
      chronicles: chronicleNotes.length,
      stats: stats.length,
      declarations: relatedDeclarations.length,
    },
  };
}
