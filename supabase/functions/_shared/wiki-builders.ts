/**
 * Entity-specific context builders for wiki generation.
 * 
 * Each builder fetches domain-specific data (buildings, provinces, cities)
 * and returns structured prompts. The world premise (chronicle0, loreBible,
 * worldVibe, writingStyle) is injected automatically by createAIContext —
 * these builders focus ONLY on entity-specific data.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface EntityContext {
  systemPrompt: string;
  userPrompt: string;
  imageInstructions: string;
  waitForCities?: boolean;
}

// ═══════════════════════════════════════════════
// CITY
// ═══════════════════════════════════════════════

export async function buildCityContext(
  sb: SupabaseClient, sessionId: string, entityId: string,
  entityName: string, ownerPlayer: string, flavorPrompt: string,
  playerLegend: string, playerSummary: string,
): Promise<EntityContext> {
  const [cityRes, buildingsRes] = await Promise.all([
    sb.from("cities").select("population_total, level, settlement_level, province, province_id, tags, special_resource_type, is_capital, founded_round, city_stability, influence_score, development_level, culture_id, language_id, military_garrison").eq("id", entityId).maybeSingle(),
    sb.from("city_buildings").select("name, category, description, is_wonder, status").eq("city_id", entityId).eq("status", "completed").limit(20),
  ]);
  const city = cityRes.data as any;
  const buildings = buildingsRes.data || [];

  let civIdentity: any = null;
  if (ownerPlayer) {
    const { data: cid } = await sb.from("civ_identity").select("display_name, flavor_summary, culture_tags, building_tags, economic_focus, military_doctrine").eq("session_id", sessionId).eq("player_name", ownerPlayer).maybeSingle();
    civIdentity = cid;
  }

  let provinceName = city?.province || "";
  if (city?.province_id) {
    const { data: prov } = await sb.from("provinces").select("name").eq("id", city.province_id).maybeSingle();
    provinceName = prov?.name || provinceName;
  }

  const pop = city?.population_total || 0;
  const level = city?.settlement_level || city?.level || "HAMLET";
  const tags = (city?.tags || []).join(", ");
  const buildingList = (buildings || []).map((b: any) => `${b.name} (${b.category}${b.is_wonder ? ", div světa" : ""})`).join(", ");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis města "${entityName}" v češtině (6-10 vět).`,
    `POVINNĚ ZAHRŇ:`,
    `- Fyzický popis města: architekturu, materiály, dominanty, atmosféru ulic.`,
    `- Velikost a charakter: ${pop} obyvatel, úroveň ${level}${city?.is_capital ? ", hlavní město" : ""}.`,
    `- Ekonomiku: co město produkuje (${city?.special_resource_type || "neznámé"}), obchod, řemesla.`,
    `- Kulturu a tradice: zvyky, náboženství, slavnosti.`,
    `- Strategický význam: stabilita ${city?.city_stability || "?"}, vliv ${city?.influence_score || "?"}.`,
    civIdentity ? `- Architektonický styl civilizace: ${civIdentity.building_tags?.join(", ") || "neznámý"}. Kulturní rysy: ${civIdentity.culture_tags?.join(", ") || "neznámé"}. ${civIdentity.flavor_summary || ""}` : "",
    buildingList ? `- Významné stavby: ${buildingList}.` : "",
    flavorPrompt ? `HRÁČŮV FLAVOR PROMPT (MUSÍŠ respektovat a integrovat): ${flavorPrompt}` : "",
    playerLegend ? `ZAKLADATELSKÁ LEGENDA (MUSÍŠ integrovat): ${playerLegend}` : "",
    `NEPIŠ obecnosti. Piš konkrétně o TOMTO městě.`,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Město: ${entityName}`, `Provincie: ${provinceName}`, `Vlastník: ${ownerPlayer}`,
    `Populace: ${pop}, úroveň: ${level}`, `Tagy: ${tags || "žádné"}`,
    `Speciální zdroj: ${city?.special_resource_type || "žádný"}`,
    playerSummary ? `Hráčovo shrnutí: ${playerSummary}` : "",
  ].filter(Boolean).join("\n");

  const imageInstructions = `A CLOSE-UP street-level or low aerial view of the ${level === "HAMLET" ? "small village" : level === "TOWN" ? "medieval town" : level === "POLIS" ? "grand city" : "settlement"} "${entityName}". Focus on architecture, walls, gates, market squares, rooftops${civIdentity?.building_tags ? ` in ${civIdentity.building_tags.join(", ")} style` : ""}. Individual buildings and people clearly visible. Population ${pop}. ${flavorPrompt ? `Key visual theme: ${flavorPrompt}.` : ""} ${tags ? `Tags: ${tags}.` : ""} The BACKGROUND should show the surrounding ${provinceName ? `province of ${provinceName}` : "countryside"} landscape — if a reference image of the province is provided, match its terrain, colors, and atmosphere in the background behind the city. Medieval manuscript art style with gold leaf details.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

// ═══════════════════════════════════════════════
// PROVINCE
// ═══════════════════════════════════════════════

export async function buildProvinceContext(
  sb: SupabaseClient, sessionId: string, entityId: string,
  entityName: string, ownerPlayer: string,
): Promise<EntityContext> {
  const [provinceRes, citiesRes] = await Promise.all([
    sb.from("provinces").select("name, owner_player, region_id, biome, hex_count").eq("id", entityId).maybeSingle(),
    sb.from("cities").select("id, name, population_total, settlement_level, special_resource_type, is_capital, tags, flavor_prompt").eq("province_id", entityId).limit(20),
  ]);
  const province = provinceRes.data as any;
  const cities = citiesRes.data || [];

  const cityIds = cities.map((c: any) => c.id);
  let cityWikiEntries: any[] = [];
  if (cityIds.length > 0) {
    const { data: wikiData } = await sb.from("wiki_entries").select("entity_id, image_url, summary, ai_description").eq("session_id", sessionId).eq("entity_type", "city").in("entity_id", cityIds);
    cityWikiEntries = wikiData || [];
  }

  const citiesWithoutImages = cityIds.length - cityWikiEntries.filter((w: any) => w.image_url).length;

  let regionName = "";
  if (province?.region_id) {
    const { data: reg } = await sb.from("regions").select("name").eq("id", province.region_id).maybeSingle();
    regionName = reg?.name || "";
  }

  const totalPop = cities.reduce((sum: number, c: any) => sum + (c.population_total || 0), 0);
  const cityDescriptions = cities.map((c: any) => {
    const wiki = cityWikiEntries.find((w: any) => w.entity_id === c.id);
    return `- ${c.name} (${c.settlement_level}, ${c.population_total} ob.${c.is_capital ? ", hlavní město" : ""}${c.special_resource_type ? `, ${c.special_resource_type}` : ""}): ${wiki?.summary || "bez popisu"}`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis provincie "${entityName}" v češtině (6-10 vět).`,
    `POVINNĚ ZAHRŇ:`,
    `- Provincie je konkrétní správní celek v regionu "${regionName}".`,
    `- Krajina a geografie: biom ${province?.biome || "neznámý"}, ${province?.hex_count || "?"} hexů.`,
    `- Celková populace: ${totalPop} obyvatel v ${cities.length} sídlech.`,
    `- Konkrétní města a jejich charakter (viz seznam níže).`,
    `- Ekonomika provincie: co se zde produkuje, jaký je hlavní zdroj obživy.`,
    `- Kultura a specifika: co odlišuje tuto provincii od ostatních.`,
    `- Politická správa a vztahy s okolím.`,
    `NEPIŠ obecnosti. Odvoď popis z KONKRÉTNÍCH měst a jejich vlastností.`,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Provincie: ${entityName}`, `Region: ${regionName}`,
    `Vlastník: ${ownerPlayer || province?.owner_player || ""}`,
    `Biom: ${province?.biome || "neznámý"}`,
    `\nMĚSTA V PROVINCII:\n${cityDescriptions || "žádná města"}`,
  ].filter(Boolean).join("\n");

  const cityScaleHints = cities.map((c: any) => {
    const sl = c.settlement_level || "HAMLET";
    const sizeWord = sl === "POLIS" ? "a large walled city" : sl === "TOWN" ? "a medium town with walls" : sl === "CITY" ? "a sizeable city" : "a tiny village or hamlet";
    return `"${c.name}" visible as ${sizeWord} (${c.population_total || 0} people)`;
  }).join("; ");

  const imageInstructions = `A WIDE panoramic medieval illuminated manuscript illustration of the province "${entityName}". View from a hilltop overlooking vast ${province?.biome || "temperate"} terrain. Focus on LANDSCAPE: rivers, fields, forests, hills, roads winding through countryside. ${province?.biome === "mountains" ? "Dramatic mountain peaks dominating the view." : province?.biome === "coast" ? "Distant coastline and sea on the horizon." : province?.biome === "forest" ? "Dense forests blanketing rolling hills." : "Rolling countryside with patchwork farmland."} ${cities.length > 0 ? `SETTLEMENTS IN LANDSCAPE: ${cityScaleHints}. Show each settlement at CORRECT relative scale — hamlets as tiny clusters, towns as modest groups, cities as larger formations. If reference images of these cities are provided, match their architectural style in the distance.` : "No visible settlements — pure wilderness."} Medieval manuscript art style with gold leaf details.`;

  return { systemPrompt, userPrompt, imageInstructions, waitForCities: citiesWithoutImages > 0 };
}

// ═══════════════════════════════════════════════
// REGION
// ═══════════════════════════════════════════════

export async function buildRegionContext(
  sb: SupabaseClient, sessionId: string, entityId: string,
  entityName: string, ownerPlayer: string,
): Promise<EntityContext> {
  const { data: region } = await sb.from("regions").select("name, biome, country_id, owner_player").eq("id", entityId).maybeSingle() as any;

  let countryName = "";
  if (region?.country_id) {
    const { data: country } = await sb.from("countries").select("name").eq("id", region.country_id).maybeSingle();
    countryName = (country as any)?.name || "";
  }

  const { data: provinces } = await sb.from("provinces").select("id, name, biome, owner_player").eq("region_id", entityId).limit(20);
  const provIds = (provinces || []).map((p: any) => p.id);
  let cities: any[] = [];
  if (provIds.length > 0) {
    const { data: cityData } = await sb.from("cities").select("name, population_total, settlement_level, province_id, special_resource_type, is_capital").in("province_id", provIds).limit(30);
    cities = cityData || [];
  }

  const totalPop = cities.reduce((sum: number, c: any) => sum + (c.population_total || 0), 0);
  const provinceDescriptions = (provinces || []).map((p: any) => {
    const provCities = cities.filter((c: any) => c.province_id === p.id);
    return `- ${p.name} (${p.biome || "neznámý"}): ${provCities.length} měst (${provCities.map((c: any) => c.name).join(", ") || "žádná"})`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis regionu "${entityName}" v češtině (6-10 vět).`,
    `POVINNĚ ZAHRŇ:`,
    `- Region je součástí země "${countryName}". Odvoď charakter regionu z jeho pozice v zemi.`,
    `- Krajina: biom ${region?.biome || "neznámý"}, typická krajina, klima, přírodní zdroje.`,
    `- Politický charakter: jak se region liší od ostatních v zemi.`,
    `- Provincie a města v regionu (viz seznam).`,
    `- Celková populace: ${totalPop} obyvatel.`,
    `- Ekonomický profil: hlavní odvětví, obchod, produkce.`,
    `- Kulturní specifika: tradice, architektura, náboženství.`,
    `Region MUSÍ být tematicky odvozen od své země, ale mít vlastní identitu.`,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Region: ${entityName}`, `Země: ${countryName}`,
    `Biom: ${region?.biome || "neznámý"}`,
    `Vlastník: ${ownerPlayer || region?.owner_player || ""}`,
    `\nPROVINCIE V REGIONU:\n${provinceDescriptions || "žádné"}`,
  ].filter(Boolean).join("\n");

  const imageInstructions = `A grand panoramic medieval illuminated manuscript illustration of the region "${entityName}". Show a vast ${region?.biome || "temperate"} landscape stretching to the horizon. ${region?.biome === "mountains" ? "Towering mountain ranges with snow-capped peaks." : region?.biome === "coast" ? "Dramatic coastline with harbors." : region?.biome === "desert" ? "Vast desert with oases and caravan routes." : region?.biome === "forest" ? "Endless dense forests with hidden clearings." : "Rolling hills, fertile valleys, and winding rivers."} ${cities.length > 0 ? `Show ${cities.length} settlements at CORRECT scale: ${cities.map((c: any) => `${c.name} (${c.settlement_level}, ${c.population_total} people)`).join(", ")}. Hamlets are barely visible, towns are modest, cities/polis are prominent. If reference images provided, match their visual style.` : "Show signs of civilization: roads, distant settlements, cultivated fields."} Medieval manuscript art with rich colors.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

// ═══════════════════════════════════════════════
// COUNTRY
// ═══════════════════════════════════════════════

export async function buildCountryContext(
  sb: SupabaseClient, sessionId: string, entityId: string,
  entityName: string, ownerPlayer: string,
): Promise<EntityContext> {
  const { data: country } = await sb.from("countries").select("name, description, motto, ruler_player").eq("id", entityId).maybeSingle() as any;
  const { data: regions } = await sb.from("regions").select("id, name, biome, owner_player").eq("country_id", entityId).limit(20);

  const regionIds = (regions || []).map((r: any) => r.id);
  let provinces: any[] = [];
  if (regionIds.length > 0) {
    const { data: provData } = await sb.from("provinces").select("id, name, biome, region_id, owner_player").in("region_id", regionIds).limit(30);
    provinces = provData || [];
  }
  const provIds = provinces.map((p: any) => p.id);
  let cities: any[] = [];
  if (provIds.length > 0) {
    const { data: cityData } = await sb.from("cities").select("name, population_total, settlement_level, province_id, is_capital, special_resource_type").in("province_id", provIds).limit(50);
    cities = cityData || [];
  }

  const ruler = ownerPlayer || country?.ruler_player;
  let civIdentity: any = null;
  if (ruler) {
    const { data: cid } = await sb.from("civ_identity").select("display_name, flavor_summary, culture_tags, economic_focus, military_doctrine").eq("session_id", sessionId).eq("player_name", ruler).maybeSingle();
    civIdentity = cid;
  }

  const totalPop = cities.reduce((sum: number, c: any) => sum + (c.population_total || 0), 0);
  const capital = cities.find((c: any) => c.is_capital);

  const regionDescriptions = (regions || []).map((r: any) => {
    const regProvs = provinces.filter((p: any) => p.region_id === r.id);
    const regCities = cities.filter((c: any) => regProvs.some((p: any) => p.id === c.province_id));
    return `- Region ${r.name} (${r.biome}): ${regProvs.length} provincií, ${regCities.length} měst (${regCities.map((c: any) => c.name).join(", ") || "žádná"})`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis země "${entityName}" v češtině (8-12 vět).`,
    `POVINNĚ ZAHRŇ:`,
    `- Země je NEJVĚTŠÍ politický celek. Popiš ji jako celistvou entitu.`,
    `- Rozloha a geografie: jaké regiony zahrnuje, jaké biomy.`,
    `- Politický systém: vládce${ruler ? ` (${ruler})` : ""}, správa.`,
    capital ? `- Hlavní město: ${capital.name} (${capital.population_total} ob.).` : "",
    `- Celková populace: ${totalPop} obyvatel v ${cities.length} sídlech.`,
    `- Regiony (viz seznam): popiš, čím se liší.`,
    `- Ekonomika: hlavní produkce, obchod, zdroje bohatství.`,
    `- Vojenská síla a bezpečnost.`,
    `- Kultura, tradice, náboženství, architektura.`,
    civIdentity ? `- Civilizační identita: ${civIdentity.display_name || ""}. ${civIdentity.flavor_summary || ""}. Ekonomika: ${civIdentity.economic_focus || "?"}. Vojenská doktrína: ${civIdentity.military_doctrine || "?"}.` : "",
    country?.motto ? `- Motto: "${country.motto}"` : "",
    `PIŠE o CELKU — zmiň jednotlivé regiony a jejich charakter v kontextu země.`,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Země: ${entityName}`, `Vládce: ${ruler || "neznámý"}`,
    country?.description ? `Původní popis: ${country.description}` : "",
    country?.motto ? `Motto: ${country.motto}` : "",
    `\nREGIONY ZEMĚ:\n${regionDescriptions || "žádné"}`,
  ].filter(Boolean).join("\n");

  const biomes = (regions || []).map((r: any) => r.biome).filter(Boolean);
  const dominantBiome = biomes[0] || "temperate";

  const imageInstructions = `A majestic, grand-scale medieval illuminated manuscript illustration of the country "${entityName}". Show a vast panoramic landscape encompassing multiple terrain types: ${biomes.length > 1 ? biomes.join(", ") : dominantBiome}. The view should be from a great height, as if surveying an entire kingdom. Show ${capital ? `the capital city ${capital.name} prominently in the center` : "a prominent settlement in the center"}, with roads radiating outward to distant regions. Include symbols of sovereignty: banners, fortified borders, trade routes. ${civIdentity?.culture_tags ? `Cultural style: ${civIdentity.culture_tags.join(", ")}.` : ""} Rich medieval manuscript art with gold leaf borders and heraldic elements.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

// ═══════════════════════════════════════════════
// GENERIC (person, wonder, battle, event, etc.)
// ═══════════════════════════════════════════════

export async function buildGenericContext(
  sb: SupabaseClient, sessionId: string, entityId: string,
  entityType: string, entityName: string, ownerPlayer: string,
  playerLegend: string, context: any,
): Promise<EntityContext> {
  const entityTypeLabels: Record<string, string> = {
    person: "osobnost", wonder: "div světa", battle: "bitva",
    event: "událost", civilization: "civilizace", academy: "akademie",
  };
  const label = entityTypeLabels[entityType] || entityType;

  const parts = [
    `Jsi encyklopedický kronikář. Napiš statickou identitu entity "${entityName}" (${label}) v češtině (4-8 vět).`,
  ];

  // Athlete context for persons
  if (entityType === "person" && entityId) {
    const { data: gpData } = await sb.from("great_persons")
      .select("person_type, flavor_trait, bio, city_id")
      .eq("id", entityId).maybeSingle();
    if (gpData && (gpData as any).person_type === "Hero") {
      let athleteCtx = `DŮLEŽITÉ: Tato osoba je SPORTOVEC/ATLET — ${(gpData as any).flavor_trait || "Hrdina Her"}. ${(gpData as any).bio || ""}. Piš o něm jako o sportovci.`;
      try {
        const { data: participations } = await sb.from("games_participants")
          .select("total_medals, is_legend").eq("great_person_id", entityId);
        if (participations?.length) {
          const totalMedals = participations.reduce((acc: number, p: any) => acc + (p.total_medals || 0), 0);
          const isLegend = participations.some((p: any) => p.is_legend);
          athleteCtx += ` Celkem ${totalMedals} medailí. ${isLegend ? "Je LEGENDOU HER." : ""}`;
        }
      } catch { /* ignore */ }
      parts.push(athleteCtx);
    } else {
      parts.push(`Zahrň: původ, činy, charakter, odkaz, vztahy k místům a událostem.`);
    }
  } else if (entityType === "wonder") {
    parts.push(`Zahrň: vzhled, historii stavby, architektonický styl, mechanický bonus, legendy.`);
  } else {
    parts.push(`Zaměř se na klíčové vlastnosti, historii a význam entity.`);
  }

  if (playerLegend) parts.push(`Hráčova legenda (MUSÍŠ integrovat): ${playerLegend}`);

  return {
    systemPrompt: parts.filter(Boolean).join("\n"),
    userPrompt: `${label}: ${entityName}\nVlastník: ${ownerPlayer}\nKontext: ${JSON.stringify(context || {})}`,
    imageInstructions: `A medieval illuminated manuscript illustration of ${entityName}, a ${label}. Detailed, rich colors, gold leaf accents.`,
  };
}
