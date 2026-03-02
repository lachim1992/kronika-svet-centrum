import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ═══════════════════════════════════════════════
// ENTITY-SPECIFIC CONTEXT BUILDERS
// ═══════════════════════════════════════════════

interface EntityContext {
  systemPrompt: string;
  userPrompt: string;
  imageInstructions: string;
}

async function buildCityContext(sb: any, sessionId: string, entityId: string, entityName: string, ownerPlayer: string, flavorPrompt: string, playerLegend: string, playerSummary: string, chronicle0: string, loreBible: string, worldVibe: string, writingInstructions: string): Promise<EntityContext> {
  // Fetch city data
  const { data: city } = await sb.from("cities").select("population_total, level, settlement_level, province, province_id, tags, special_resource_type, is_capital, founded_round, city_stability, influence_score, development_level, culture_id, language_id, military_garrison").eq("id", entityId).maybeSingle();

  // Fetch civ identity for architectural style
  let civIdentity: any = null;
  if (ownerPlayer) {
    const { data: cid } = await sb.from("civ_identity").select("display_name, flavor_summary, culture_tags, building_tags, economic_focus, military_doctrine").eq("session_id", sessionId).eq("player_name", ownerPlayer).maybeSingle();
    civIdentity = cid;
  }

  // Fetch buildings
  const { data: buildings } = await sb.from("city_buildings").select("name, category, description, is_wonder, status").eq("city_id", entityId).eq("status", "completed").limit(20);

  // Fetch province name
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
    writingInstructions,
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
    chronicle0 ? `PROLOG SVĚTA:\n${chronicle0.substring(0, 2000)}` : "",
    loreBible ? `Lore světa:\n${loreBible.substring(0, 600)}` : "",
    worldVibe ? `Tón světa: ${worldVibe}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Město: ${entityName}`,
    `Provincie: ${provinceName}`,
    `Vlastník: ${ownerPlayer}`,
    `Populace: ${pop}, úroveň: ${level}`,
    `Tagy: ${tags || "žádné"}`,
    `Speciální zdroj: ${city?.special_resource_type || "žádný"}`,
    playerSummary ? `Hráčovo shrnutí: ${playerSummary}` : "",
  ].filter(Boolean).join("\n");

  const imageInstructions = `A CLOSE-UP street-level or low aerial view of the ${level === "HAMLET" ? "small village" : level === "TOWN" ? "medieval town" : level === "POLIS" ? "grand city" : "settlement"} "${entityName}". Focus on architecture, walls, gates, market squares, rooftops${civIdentity?.building_tags ? ` in ${civIdentity.building_tags.join(", ")} style` : ""}. Individual buildings and people clearly visible. Population ${pop}. ${flavorPrompt ? `Key visual theme: ${flavorPrompt}.` : ""} ${tags ? `Tags: ${tags}.` : ""} DO NOT show wide landscape — zoom INTO the settlement itself. Medieval manuscript art style with gold leaf details.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

async function buildProvinceContext(sb: any, sessionId: string, entityId: string, entityName: string, ownerPlayer: string, chronicle0: string, loreBible: string, worldVibe: string, writingInstructions: string): Promise<EntityContext & { waitForCities?: boolean }> {
  // Fetch province
  const { data: province } = await sb.from("provinces").select("name, owner_player, region_id, biome, hex_count").eq("id", entityId).maybeSingle();

  // Fetch cities in this province
  const { data: cities } = await sb.from("cities").select("id, name, population_total, settlement_level, special_resource_type, is_capital, tags, flavor_prompt").eq("province_id", entityId).limit(20);

  // Check if cities have wiki images
  const cityIds = (cities || []).map((c: any) => c.id);
  let cityWikiEntries: any[] = [];
  if (cityIds.length > 0) {
    const { data: wikiData } = await sb.from("wiki_entries").select("entity_id, image_url, summary, ai_description").eq("session_id", sessionId).eq("entity_type", "city").in("entity_id", cityIds);
    cityWikiEntries = wikiData || [];
  }

  // Check if cities have images — if not, flag it but don't block
  const citiesWithImages = cityWikiEntries.filter((w: any) => w.image_url);
  const citiesWithoutImages = cityIds.length - citiesWithImages.length;

  // Fetch region name
  let regionName = "";
  if (province?.region_id) {
    const { data: reg } = await sb.from("regions").select("name").eq("id", province.region_id).maybeSingle();
    regionName = reg?.name || "";
  }

  const totalPop = (cities || []).reduce((sum: number, c: any) => sum + (c.population_total || 0), 0);
  const cityDescriptions = (cities || []).map((c: any) => {
    const wiki = cityWikiEntries.find((w: any) => w.entity_id === c.id);
    return `- ${c.name} (${c.settlement_level}, ${c.population_total} ob.${c.is_capital ? ", hlavní město" : ""}${c.special_resource_type ? `, ${c.special_resource_type}` : ""}): ${wiki?.summary || "bez popisu"}`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis provincie "${entityName}" v češtině (6-10 vět).`,
    writingInstructions,
    `POVINNĚ ZAHRŇ:`,
    `- Provincie je konkrétní správní celek v regionu "${regionName}".`,
    `- Krajina a geografie: biom ${province?.biome || "neznámý"}, ${province?.hex_count || "?"} hexů.`,
    `- Celková populace: ${totalPop} obyvatel v ${(cities || []).length} sídlech.`,
    `- Konkrétní města a jejich charakter (viz seznam níže).`,
    `- Ekonomika provincie: co se zde produkuje, jaký je hlavní zdroj obživy.`,
    `- Kultura a specifika: co odlišuje tuto provincii od ostatních.`,
    `- Politická správa a vztahy s okolím.`,
    `NEPIŠ obecnosti. Odvoď popis z KONKRÉTNÍCH měst a jejich vlastností.`,
    chronicle0 ? `PROLOG:\n${chronicle0.substring(0, 1500)}` : "",
    loreBible ? `Lore:\n${loreBible.substring(0, 500)}` : "",
    worldVibe ? `Tón: ${worldVibe}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Provincie: ${entityName}`,
    `Region: ${regionName}`,
    `Vlastník: ${ownerPlayer || province?.owner_player || ""}`,
    `Biom: ${province?.biome || "neznámý"}`,
    `\nMĚSTA V PROVINCII:\n${cityDescriptions || "žádná města"}`,
  ].filter(Boolean).join("\n");

  // Image: wide landscape, settlements only as tiny dots in far distance
  const imageInstructions = `A WIDE panoramic medieval illuminated manuscript illustration of the province "${entityName}". View from a hilltop overlooking vast ${province?.biome || "temperate"} terrain. Focus on LANDSCAPE: rivers, fields, forests, hills, roads winding through countryside. ${province?.biome === "mountains" ? "Dramatic mountain peaks dominating the view." : province?.biome === "coast" ? "Distant coastline and sea on the horizon." : province?.biome === "forest" ? "Dense forests blanketing rolling hills." : "Rolling countryside with patchwork farmland."} Settlements appear ONLY as tiny specks of smoke or faint rooftops on the distant horizon — DO NOT show close-up buildings or streets. This is a LANDSCAPE view, not a city view. Medieval manuscript art style.`;

  return { systemPrompt, userPrompt, imageInstructions, waitForCities: citiesWithoutImages > 0 };
}

async function buildRegionContext(sb: any, sessionId: string, entityId: string, entityName: string, ownerPlayer: string, chronicle0: string, loreBible: string, worldVibe: string, writingInstructions: string): Promise<EntityContext> {
  // Fetch region
  const { data: region } = await sb.from("regions").select("name, biome, country_id, owner_player").eq("id", entityId).maybeSingle();

  // Fetch country
  let countryName = "";
  if (region?.country_id) {
    const { data: country } = await sb.from("countries").select("name, description").eq("id", region.country_id).maybeSingle();
    countryName = country?.name || "";
  }

  // Fetch provinces in this region
  const { data: provinces } = await sb.from("provinces").select("id, name, biome, owner_player").eq("region_id", entityId).limit(20);

  // Fetch cities in these provinces
  const provIds = (provinces || []).map((p: any) => p.id);
  let cities: any[] = [];
  if (provIds.length > 0) {
    const { data: cityData } = await sb.from("cities").select("name, population_total, settlement_level, province_id, special_resource_type, is_capital").in("province_id", provIds).limit(30);
    cities = cityData || [];
  }

  const totalPop = cities.reduce((sum: number, c: any) => sum + (c.population_total || 0), 0);
  const provinceDescriptions = (provinces || []).map((p: any) => {
    const provCities = cities.filter((c: any) => c.province_id === p.id);
    const cityNames = provCities.map((c: any) => c.name).join(", ");
    return `- ${p.name} (${p.biome || "neznámý"}): ${provCities.length} měst (${cityNames || "žádná"})`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis regionu "${entityName}" v češtině (6-10 vět).`,
    writingInstructions,
    `POVINNĚ ZAHRŇ:`,
    `- Region je součástí země "${countryName}". Odvoď charakter regionu z jeho pozice v zemi.`,
    `- Krajina: biom ${region?.biome || "neznámý"}, typická krajina, klima, přírodní zdroje.`,
    `- Politický charakter: jak se region liší od ostatních v zemi, jaké jsou vztahy s centrem.`,
    `- Provincie a města v regionu (viz seznam).`,
    `- Celková populace: ${totalPop} obyvatel.`,
    `- Ekonomický profil: hlavní odvětví, obchod, produkce.`,
    `- Kulturní specifika: tradice, architektura, náboženství.`,
    `Region MUSÍ být tematicky odvozen od své země, ale mít vlastní identitu.`,
    chronicle0 ? `PROLOG:\n${chronicle0.substring(0, 1500)}` : "",
    loreBible ? `Lore:\n${loreBible.substring(0, 500)}` : "",
    worldVibe ? `Tón: ${worldVibe}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Region: ${entityName}`,
    `Země: ${countryName}`,
    `Biom: ${region?.biome || "neznámý"}`,
    `Vlastník: ${ownerPlayer || region?.owner_player || ""}`,
    `\nPROVINCIE V REGIONU:\n${provinceDescriptions || "žádné"}`,
  ].filter(Boolean).join("\n");

  const imageInstructions = `A grand panoramic medieval illuminated manuscript illustration of the region "${entityName}". Show a vast ${region?.biome || "temperate"} landscape stretching to the horizon. ${region?.biome === "mountains" ? "Towering mountain ranges with snow-capped peaks." : region?.biome === "coast" ? "Dramatic coastline with harbors and fishing villages." : region?.biome === "desert" ? "Vast desert with oases and caravan routes." : region?.biome === "forest" ? "Endless dense forests with hidden clearings." : "Rolling hills, fertile valleys, and winding rivers."} Show signs of civilization: roads, distant settlements, cultivated fields. Political banners or border markers hint at territorial control. Medieval manuscript art with rich colors.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

async function buildCountryContext(sb: any, sessionId: string, entityId: string, entityName: string, ownerPlayer: string, chronicle0: string, loreBible: string, worldVibe: string, writingInstructions: string): Promise<EntityContext> {
  // Fetch country
  const { data: country } = await sb.from("countries").select("name, description, motto, ruler_player").eq("id", entityId).maybeSingle();

  // Fetch regions
  const { data: regions } = await sb.from("regions").select("id, name, biome, owner_player").eq("country_id", entityId).limit(20);

  // Fetch provinces across all regions
  const regionIds = (regions || []).map((r: any) => r.id);
  let provinces: any[] = [];
  if (regionIds.length > 0) {
    const { data: provData } = await sb.from("provinces").select("id, name, biome, region_id, owner_player").in("region_id", regionIds).limit(30);
    provinces = provData || [];
  }

  // Fetch cities across all provinces
  const provIds = provinces.map((p: any) => p.id);
  let cities: any[] = [];
  if (provIds.length > 0) {
    const { data: cityData } = await sb.from("cities").select("name, population_total, settlement_level, province_id, is_capital, special_resource_type").in("province_id", provIds).limit(50);
    cities = cityData || [];
  }

  // Fetch civ identity
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
    const cityNames = regCities.map((c: any) => c.name).join(", ");
    return `- Region ${r.name} (${r.biome}): ${regProvs.length} provincií, ${regCities.length} měst (${cityNames || "žádná"})`;
  }).join("\n");

  const systemPrompt = [
    `Jsi encyklopedický kronikář. Napiš DETAILNÍ popis země (státu) "${entityName}" v češtině (8-12 vět).`,
    writingInstructions,
    `POVINNĚ ZAHRŇ:`,
    `- Země je NEJVĚTŠÍ politický celek. Popiš ji jako celistvou entitu.`,
    `- Rozloha a geografie: jaké regiony země zahrnuje, jaké biomy, jaká je krajina.`,
    `- Politický systém: vládce${ruler ? ` (${ruler})` : ""}, správa, vztahy mezi regiony.`,
    capital ? `- Hlavní město: ${capital.name} (${capital.population_total} ob.).` : "",
    `- Celková populace: ${totalPop} obyvatel v ${cities.length} sídlech.`,
    `- Regiony (viz seznam): popiš, co se v nich nachází, čím se liší.`,
    `- Ekonomika: hlavní produkce, obchod, zdroje bohatství.`,
    `- Vojenská síla a bezpečnost.`,
    `- Kultura, tradice, náboženství, architektura.`,
    civIdentity ? `- Civilizační identita: ${civIdentity.display_name || ""}. ${civIdentity.flavor_summary || ""}. Ekonomika: ${civIdentity.economic_focus || "?"}. Vojenská doktrína: ${civIdentity.military_doctrine || "?"}.` : "",
    country?.motto ? `- Motto: "${country.motto}"` : "",
    `PIŠE o CELKU — zmiň jednotlivé regiony a jejich charakter v kontextu země.`,
    chronicle0 ? `PROLOG:\n${chronicle0.substring(0, 2000)}` : "",
    loreBible ? `Lore:\n${loreBible.substring(0, 600)}` : "",
    worldVibe ? `Tón: ${worldVibe}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Země: ${entityName}`,
    `Vládce: ${ruler || "neznámý"}`,
    country?.description ? `Původní popis: ${country.description}` : "",
    country?.motto ? `Motto: ${country.motto}` : "",
    `\nREGIONY ZEMĚ:\n${regionDescriptions || "žádné"}`,
  ].filter(Boolean).join("\n");

  // Determine dominant biome
  const biomes = (regions || []).map((r: any) => r.biome).filter(Boolean);
  const dominantBiome = biomes[0] || "temperate";

  const imageInstructions = `A majestic, grand-scale medieval illuminated manuscript illustration of the country "${entityName}". Show a vast panoramic landscape encompassing multiple terrain types: ${biomes.length > 1 ? biomes.join(", ") : dominantBiome}. The view should be from a great height, as if surveying an entire kingdom. Show ${capital ? `the capital city ${capital.name} prominently in the center` : "a prominent settlement in the center"}, with roads radiating outward to distant regions. Include symbols of sovereignty: banners, fortified borders, trade routes. ${civIdentity?.culture_tags ? `Cultural style: ${civIdentity.culture_tags.join(", ")}.` : ""} Rich medieval manuscript art with gold leaf borders and heraldic elements.`;

  return { systemPrompt, userPrompt, imageInstructions };
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, entityId, sessionId, ownerPlayer, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        summary: `${entityName} — slavný ${entityType} tohoto světa.`,
        aiDescription: `Kronikáři dosud marně hledají slova pro ${entityName}.`,
        imageUrl: null,
        debug: { provider: "placeholder" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ═══ Fetch existing wiki entry to preserve player-written content ═══
    const { data: existingWiki } = await sb
      .from("wiki_entries")
      .select("body_md, summary, ai_description")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    const playerLegend = (existingWiki as any)?.body_md || "";
    const playerSummary = (existingWiki as any)?.summary || "";

    // ═══ Fetch flavor_prompt for cities ═══
    let flavorPrompt = "";
    if (entityType === "city") {
      const { data: cityData } = await sb.from("cities").select("flavor_prompt").eq("id", entityId).maybeSingle();
      flavorPrompt = (cityData as any)?.flavor_prompt || "";
    }

    // ═══ Athlete context for persons ═══
    let athleteContext = "";
    if (entityType === "person" && entityId) {
      const { data: gpData } = await sb.from("great_persons")
        .select("person_type, flavor_trait, bio, city_id")
        .eq("id", entityId).maybeSingle();
      if (gpData && gpData.person_type === "Hero") {
        athleteContext = `DŮLEŽITÉ: Tato osoba je SPORTOVEC/ATLET — ${gpData.flavor_trait || "Hrdina Her"}. ${gpData.bio || ""}. Piš o něm jako o sportovci.`;
        try {
          const { data: participations } = await sb.from("games_participants")
            .select("total_medals, is_legend")
            .eq("great_person_id", entityId);
          if (participations && participations.length > 0) {
            const totalMedals = participations.reduce((acc: number, p: any) => acc + (p.total_medals || 0), 0);
            const isLegend = participations.some((p: any) => p.is_legend);
            athleteContext += ` Celkem ${totalMedals} medailí. ${isLegend ? "Je LEGENDOU HER." : ""}`;
          }
        } catch (_) {}
      }
    }

    // ═══ Fetch lore bible + prompt_rules ═══
    const { data: styleCfg } = await sb
      .from("game_style_settings")
      .select("lore_bible, prompt_rules")
      .eq("session_id", sessionId)
      .maybeSingle();
    const loreBible = styleCfg?.lore_bible || "";
    let styleRules: any = {};
    try { styleRules = styleCfg?.prompt_rules ? JSON.parse(styleCfg.prompt_rules) : {}; } catch { /* ignore */ }

    // ═══ Fetch Chronicle 0 (Prolog) ═══
    let chronicle0Text = "";
    try {
      const { data: c0 } = await sb
        .from("chronicle_entries")
        .select("text")
        .eq("session_id", sessionId)
        .eq("source_type", "chronicle_zero")
        .maybeSingle();
      chronicle0Text = (c0 as any)?.text || "";
    } catch { /* ignore */ }

    const worldVibe = styleRules.world_vibe || "";
    const writingStyle = styleRules.writing_style || "narrative";

    const writingInstructions = writingStyle === "political-chronicle"
      ? "Piš jako politický kronikář — střízlivě, fakticky, bez přehnaných metafor."
      : writingStyle === "epic-saga"
      ? "Piš jako bard — vznešeně, epicky, s metaforami."
      : "Piš jako středověký učenec — vzdělaně, s respektem k faktům.";

    // ═══════════════════════════════════════════════
    // BUILD ENTITY-SPECIFIC CONTEXT
    // ═══════════════════════════════════════════════
    let entityCtx: EntityContext & { waitForCities?: boolean };

    if (entityType === "city") {
      entityCtx = await buildCityContext(sb, sessionId, entityId, entityName, ownerPlayer, flavorPrompt, playerLegend, playerSummary, chronicle0Text, loreBible, worldVibe, writingInstructions);
    } else if (entityType === "province") {
      entityCtx = await buildProvinceContext(sb, sessionId, entityId, entityName, ownerPlayer, chronicle0Text, loreBible, worldVibe, writingInstructions);
    } else if (entityType === "region") {
      entityCtx = await buildRegionContext(sb, sessionId, entityId, entityName, ownerPlayer, chronicle0Text, loreBible, worldVibe, writingInstructions);
    } else if (entityType === "country") {
      entityCtx = await buildCountryContext(sb, sessionId, entityId, entityName, ownerPlayer, chronicle0Text, loreBible, worldVibe, writingInstructions);
    } else {
      // Fallback for person, wonder, battle, event, etc. — generic
      const entityTypeLabels: Record<string, string> = {
        person: "osobnost", wonder: "div světa", battle: "bitva",
        event: "událost", civilization: "civilizace", academy: "akademie",
      };
      const label = entityTypeLabels[entityType] || entityType;

      let genericSystem = [
        `Jsi encyklopedický kronikář. Napiš statickou identitu entity "${entityName}" (${label}) v češtině (4-8 vět).`,
        writingInstructions,
      ];

      if (entityType === "person" && athleteContext) {
        genericSystem.push(athleteContext);
      } else if (entityType === "person") {
        genericSystem.push(`Zahrň: původ, činy, charakter, odkaz, vztahy k místům a událostem.`);
      } else if (entityType === "wonder") {
        genericSystem.push(`Zahrň: vzhled, historii stavby, architektonický styl, mechanický bonus, legendy.`);
      } else {
        genericSystem.push(`Zaměř se na klíčové vlastnosti, historii a význam entity.`);
      }

      if (playerLegend) genericSystem.push(`Hráčova legenda (MUSÍŠ integrovat): ${playerLegend}`);
      if (chronicle0Text) genericSystem.push(`PROLOG:\n${chronicle0Text.substring(0, 1500)}`);
      if (loreBible) genericSystem.push(`Lore:\n${loreBible.substring(0, 500)}`);
      if (worldVibe) genericSystem.push(`Tón: ${worldVibe}`);

      entityCtx = {
        systemPrompt: genericSystem.filter(Boolean).join("\n"),
        userPrompt: `${label}: ${entityName}\nVlastník: ${ownerPlayer}\nKontext: ${JSON.stringify(context || {})}`,
        imageInstructions: `A medieval illuminated manuscript illustration of ${entityName}, a ${label}. Detailed, rich colors, gold leaf accents.`,
      };
    }

    // ═══════════════════════════════════════════════
    // AI CALL with retry logic
    // ═══════════════════════════════════════════════
    let summary = `${entityName} — záznam v encyklopedii.`;
    let aiDescription = "";
    let imagePrompt = entityCtx.imageInstructions;
    let staticIdentity: any = null;
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const descResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: entityCtx.systemPrompt },
            { role: "user", content: entityCtx.userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_wiki_entry",
              description: "Create wiki entry with detailed description",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "One-sentence Czech summary" },
                  aiDescription: { type: "string", description: "Full article in Czech, multiple paragraphs" },
                  imagePrompt: { type: "string", description: "English image prompt — MUST follow the style instructions provided" },
                  staticIdentity: {
                    type: "object",
                    description: "Structured identity data",
                    properties: {
                      geography: { type: "string" },
                      culture: { type: "string" },
                      economy: { type: "string" },
                      demography: { type: "string" },
                    },
                  },
                },
                required: ["summary", "aiDescription", "imagePrompt"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "create_wiki_entry" } },
        }),
      });

      if (descResponse.ok) {
        const descData = await descResponse.json();
        const tc = descData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) {
          const parsed = JSON.parse(tc.function.arguments);
          summary = parsed.summary || summary;
          aiDescription = parsed.aiDescription || aiDescription;
          // Merge AI image prompt with our structural instructions
          imagePrompt = parsed.imagePrompt || imagePrompt;
          staticIdentity = parsed.staticIdentity || null;
        }
      } else if (descResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else if (descResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (aiDescription && aiDescription.trim().length > 10) break;

      if (attempt < MAX_RETRIES) {
        console.warn(`wiki-generate: ai_description empty for ${entityName} (${entityType}), retry ${attempt + 1}`);
      }
    }

    if (!aiDescription || aiDescription.trim().length < 10) {
      aiDescription = `Informace o ${entityName} dosud nebyly zaznamenány kronikářem.`;
    }

    // ═══ Upsert wiki entry ═══
    const styleHash = loreBible ? loreBible.substring(0, 32) : "none";
    if (sessionId) {
      const { data: existing } = await sb
        .from("wiki_entries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();

      const wikiPayload: any = {
        summary,
        ai_description: aiDescription,
        image_prompt: imagePrompt,
        static_identity: staticIdentity || {},
        last_enriched_turn: 0,
        updated_at: new Date().toISOString(),
        references: {
          style_hash: styleHash,
          style_version: "2",
          world_vibe: worldVibe,
          writing_style: writingStyle,
          entity_context_type: entityType,
        },
      };

      if (existing && playerLegend) {
        // Preserve player-written body_md
      } else if (!existing) {
        wikiPayload.body_md = playerLegend || null;
      }

      if (existing) {
        await sb.from("wiki_entries").update(wikiPayload).eq("id", existing.id);
      } else {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId,
          entity_type: entityType,
          entity_id: entityId || null,
          entity_name: entityName,
          owner_player: ownerPlayer,
          ...wikiPayload,
        } as any, { onConflict: "id" });
      }
    }

    // ═══ Generate image via unified pipeline ═══
    let imageUrl: string | null = null;
    if (entityId && sessionId) {
      try {
        const mediaRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-entity-media`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            entityId,
            entityType,
            entityName,
            kind: "cover",
            imagePrompt,
            createdBy: ownerPlayer || "wiki-generate",
          }),
        });
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          imageUrl = mediaData.imageUrl || null;
        }
      } catch (imgErr) {
        console.error("Wiki image delegation failed:", imgErr);
      }
    }

    return new Response(JSON.stringify({
      summary, aiDescription, imageUrl, imagePrompt,
      debug: { provider: "lovable-ai", pipeline: "cascading-v2", entityType, worldVibe, writingStyle }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("wiki-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
