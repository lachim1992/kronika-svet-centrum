/**
 * Unified AI Context Module — "Premisa světa"
 * 
 * Single source of truth for all AI generation context.
 * Every AI call MUST use loadWorldPremise() to inject the canonical premise.
 * 
 * Architecture:
 * - world_premise table = canonical storage (versioned, auto-evolvable)
 * - Fallback: game_style_settings + game_sessions for legacy data
 * - All generators import this module instead of building their own context
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ─── Types ───

export interface WorldPremise {
  id: string;
  sessionId: string;
  seed: string | null;
  epochStyle: string;
  cosmology: string;
  narrativeRules: Record<string, any>;
  economicBias: string;
  warBias: string;
  loreBible: string;
  worldVibe: string;
  writingStyle: string;
  constraints: string;
  version: number;
  /** Chronicle 0 (Prolog) text — the canonical founding narrative of the world */
  chronicle0: string;
}

export interface AIRequestContext {
  sessionId: string;
  requestId: string;
  turnNumber?: number;
  premise: WorldPremise;
  /** Pre-built system prompt prefix containing premise instructions */
  premisePrompt: string;
  /** Optional: loaded civ DNA for the relevant player */
  civContext?: { culturalQuirk?: string; architecturalStyle?: string; civName?: string };
}

export interface AIInvokeOptions {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: any[];
  toolChoice?: any;
  maxTokens?: number;
}

export interface AIInvokeResult {
  ok: boolean;
  data?: any;
  error?: string;
  status?: number;
  debug?: {
    requestId: string;
    model: string;
    premiseVersion: number;
    sessionId: string;
    turnNumber?: number;
  };
}

// ─── Constants ───

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const WRITING_STYLE_MAP: Record<string, string> = {
  "narrative": "Piš jako středověký učenec — vzdělaně, s respektem k faktům.",
  "political-chronicle": "Piš jako politický kronikář — střízlivě, fakticky, bez přehnaných metafor. Styl zpravodajského komentáře.",
  "epic-saga": "Piš jako bard — vznešeně, epicky, s metaforami a odkazem na mýty.",
  "mythical": "Piš jako starověký mytograf — legendární, plný metafor a nadpřirozených prvků.",
  "modern": "Piš jako moderní novinář — stručný, faktický styl zpravodajství.",
};

const EPOCH_STYLE_MAP: Record<string, string> = {
  "myty": "Epocha mýtů: Používej legendární, epický jazyk.",
  "kroniky": "Epocha kronik: Formální, vznešený jazyk s archaickými obraty.",
  "moderni": "Moderní éra: Stručný, faktický styl.",
};

// ─── Supabase Helper ───

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Core: Load World Premise ───

/**
 * Load the active world premise for a session.
 * Falls back to game_style_settings + game_sessions if no world_premise row exists.
 * Creates a world_premise row from legacy data if missing (migration path).
 */
export async function loadWorldPremise(sessionId: string, sb?: SupabaseClient): Promise<WorldPremise> {
  const client = sb || getServiceClient();

  // 0. Load Chronicle 0 (prolog) text — canonical founding narrative
  let chronicle0Text = "";
  try {
    const { data: c0 } = await client
      .from("chronicle_entries")
      .select("text")
      .eq("session_id", sessionId)
      .eq("source_type", "chronicle_zero")
      .maybeSingle();
    chronicle0Text = (c0 as any)?.text || "";
  } catch { /* ignore */ }

  // 1. Try canonical world_premise table
  const { data: premise } = await client
    .from("world_premise")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_active", true)
    .maybeSingle();

  if (premise) {
    return {
      id: premise.id,
      sessionId: premise.session_id,
      seed: premise.seed,
      epochStyle: premise.epoch_style,
      cosmology: premise.cosmology || "",
      narrativeRules: premise.narrative_rules || {},
      economicBias: premise.economic_bias || "balanced",
      warBias: premise.war_bias || "neutral",
      loreBible: premise.lore_bible || "",
      worldVibe: premise.world_vibe || "",
      writingStyle: premise.writing_style || "narrative",
      constraints: premise.constraints || "",
      version: premise.version,
      chronicle0: chronicle0Text,
    };
  }

  // 2. Fallback: consolidate from legacy tables
  const [sessionRes, styleRes, configRes] = await Promise.all([
    client.from("game_sessions").select("epoch_style, world_seed").eq("id", sessionId).maybeSingle(),
    client.from("game_style_settings").select("lore_bible, prompt_rules").eq("session_id", sessionId).maybeSingle(),
    client.from("server_config").select("economic_params").eq("session_id", sessionId).maybeSingle(),
  ]);

  const session = sessionRes.data;
  const style = styleRes.data;
  const config = configRes.data;

  let promptRules: any = {};
  try { promptRules = style?.prompt_rules ? JSON.parse(style.prompt_rules) : {}; } catch { /* ignore */ }

  const narrativeConfig = (config as any)?.economic_params?.narrative || {};

  const legacy: WorldPremise = {
    id: "",
    sessionId,
    seed: session?.world_seed || null,
    epochStyle: session?.epoch_style || "kroniky",
    cosmology: "",
    narrativeRules: narrativeConfig,
    economicBias: "balanced",
    warBias: "neutral",
    loreBible: style?.lore_bible || "",
    worldVibe: promptRules.world_vibe || "",
    writingStyle: promptRules.writing_style || "narrative",
    constraints: promptRules.constraints || "",
    version: 1,
    chronicle0: chronicle0Text,
  };

  // 3. Persist as canonical world_premise (auto-migration)
  try {
    const { data: inserted } = await client.from("world_premise").insert({
      session_id: sessionId,
      seed: legacy.seed,
      epoch_style: legacy.epochStyle,
      cosmology: legacy.cosmology,
      narrative_rules: legacy.narrativeRules,
      economic_bias: legacy.economicBias,
      war_bias: legacy.warBias,
      lore_bible: legacy.loreBible,
      world_vibe: legacy.worldVibe,
      writing_style: legacy.writingStyle,
      constraints: legacy.constraints,
      version: 1,
      is_active: true,
    }).select("id").single();
    if (inserted) legacy.id = inserted.id;
  } catch (e) {
    // Could fail on unique constraint if parallel call — that's OK
    console.warn("world_premise auto-migration insert skipped:", e);
  }

  return legacy;
}

// ─── Build Premise Prompt ───

/**
 * Build a standardized system prompt prefix from the world premise.
 * This MUST be prepended to every AI system prompt.
 */
export function buildPremisePrompt(premise: WorldPremise): string {
  const parts: string[] = [];

  parts.push("=== PREMISA SVĚTA (povinný kontext — MUSÍŠ respektovat) ===");
  parts.push("PRAVIDLO PRIORITY: Pokud dojde ke konfliktu mezi vrstvami, VŽDY platí vrstva s nižším číslem. P1 vítězí nad P2, P2 nad P3 atd.");

  // ── P1 — CONSTRAINTS (tvrdé zákazy, nepřekročitelné) ──
  if (premise.constraints) {
    parts.push(`[P1 — NEPŘEKROČITELNÁ OMEZENÍ]\n${premise.constraints}`);
  }

  // Forbidden words from narrative rules (also P1)
  const saga = premise.narrativeRules?.saga;
  const history = premise.narrativeRules?.history;
  if (saga?.forbidden?.length) {
    parts.push(`[P1 — ZAKÁZANÁ SLOVA (nikdy nepoužívej)]: ${saga.forbidden.join(", ")}`);
  }

  // ── P2 — STRUCTURAL PREMISE (epoch, cosmology, seed) ──
  const epochInstruction = EPOCH_STYLE_MAP[premise.epochStyle] || EPOCH_STYLE_MAP["kroniky"];
  parts.push(`[P2 — STRUKTURÁLNÍ PREMISA]\nEPOCHA: ${epochInstruction}`);

  if (premise.cosmology) {
    parts.push(`KOSMOLOGIE: ${premise.cosmology}`);
  }

  if (premise.seed) {
    parts.push(`SVĚT SEED: ${premise.seed}`);
  }

  // ── P3 — LORE BIBLE (canonical entities, relationships) ──
  if (premise.loreBible) {
    parts.push(`[P3 — LORE BIBLE (kanonické entity a vztahy)]\n${premise.loreBible.substring(0, 1200)}`);
  }

  // ── P4 — CHRONICLE 0 (founding narrative) ──
  if (premise.chronicle0) {
    const c0Truncated = premise.chronicle0.length > 3000
      ? premise.chronicle0.substring(0, 3000) + "\n[...zkráceno]"
      : premise.chronicle0;
    parts.push(`[P4 — KRONIKA NULTÉHO ROKU (Prolog — kanonický zdroj pravdy o prehistorii, legendách, válkách a mýtech. MUSÍŠ na něj navazovat!)]\n${c0Truncated}`);
  }

  // ── P5 — VIBE + STYLE (atmosphere, writing style) ──
  const writingInstruction = WRITING_STYLE_MAP[premise.writingStyle] || WRITING_STYLE_MAP["narrative"];
  parts.push(`[P5 — ATMOSFÉRA A STYL]\nSTYL PSANÍ: ${writingInstruction}`);

  if (premise.worldVibe) {
    parts.push(`ATMOSFÉRA SVĚTA: ${premise.worldVibe}`);
  }

  // ── P6 — NARRATIVE RULES (saga stance, keywords, style prompts) ──
  const narrativeParts: string[] = [];
  if (saga) {
    if (saga.stance && saga.stance !== "pro-regime") {
      const stanceMap: Record<string, string> = {
        "neutral": "Piš neutrálně, bez zaujatosti k žádné straně.",
        "critical": "Piš kriticky, zpochybňuj motivy vládců a poukazuj na slabiny.",
        "mythical": "Piš jako mýtický vypravěč, zesiluj nadpřirozené prvky a osudovost.",
        "pro-regime": "Piš jako dvorní kronikář, oslavuj vládce a jeho činy.",
      };
      narrativeParts.push(`POSTOJ KRONIKÁŘE: ${stanceMap[saga.stance] || saga.stance}`);
    }
    if (saga.style_prompt) narrativeParts.push(`STYLOVÝ POKYN PRO SÁGY: ${saga.style_prompt}`);
    if (saga.keywords?.length) narrativeParts.push(`PREFEROVANÁ KLÍČOVÁ SLOVA: ${saga.keywords.join(", ")}`);
  }
  if (history) {
    if (history.style_prompt) narrativeParts.push(`STYLOVÝ POKYN PRO HISTORII: ${history.style_prompt}`);
    if (history.include_metrics) narrativeParts.push("ZAHRNOUT METRIKY: Ano — uváděj populační, ekonomické a vojenské statistiky kde jsou k dispozici.");
  }
  if (narrativeParts.length > 0) {
    parts.push(`[P6 — NARATIVNÍ PRAVIDLA]\n${narrativeParts.join("\n")}`);
  }

  // ── P7 — BIAS (optional emphasis) ──
  const biasParts: string[] = [];
  if (premise.economicBias !== "balanced") biasParts.push(`EKONOMICKÝ DŮRAZ: ${premise.economicBias}`);
  if (premise.warBias !== "neutral") biasParts.push(`VÁLEČNÝ DŮRAZ: ${premise.warBias}`);
  if (biasParts.length > 0) {
    parts.push(`[P7 — DŮRAZY]\n${biasParts.join("\n")}`);
  }

  parts.push("=== KONEC PREMISY ===");

  return parts.join("\n\n");
}

// ─── Unified AI Invocation ───

/**
 * Create a full AI request context with premise loaded from DB.
 */
export async function createAIContext(
  sessionId: string,
  turnNumber?: number,
  sb?: SupabaseClient,
  playerName?: string,
): Promise<AIRequestContext> {
  const requestId = crypto.randomUUID();
  const client = sb || getServiceClient();
  const premise = await loadWorldPremise(sessionId, client);
  let premisePrompt = buildPremisePrompt(premise);

  // Load civilization DNA + structured identity for cultural context injection
  let civContext: AIRequestContext["civContext"] = undefined;
  if (playerName) {
    const [civRes, identityRes] = await Promise.all([
      client
        .from("civilizations")
        .select("cultural_quirk, architectural_style, civ_name")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle(),
      client
        .from("civ_identity")
        .select("culture_tags, urban_style, society_structure, military_doctrine, economic_focus")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle(),
    ]);
    const civ = civRes.data;
    const identity = identityRes.data;

    if (civ) {
      civContext = {
        culturalQuirk: civ.cultural_quirk || undefined,
        architecturalStyle: civ.architectural_style || undefined,
        civName: civ.civ_name || undefined,
      };
      const civParts: string[] = [];
      civParts.push("\n=== CIVILIZAČNÍ KONTEXT ===");
      if (civ.civ_name) civParts.push(`Civilizace: ${civ.civ_name}`);
      if (civ.cultural_quirk) civParts.push(`KULTURNÍ ZVLÁŠTNOST (MUSÍŠ reflektovat v textu — ovlivňuje chování, rituály, rozhodování): ${civ.cultural_quirk}`);
      if (civ.architectural_style) civParts.push(`ARCHITEKTONICKÝ STYL (MUSÍŠ reflektovat v popisu budov, měst, vizuálů): ${civ.architectural_style}`);

      // Inject structured identity tags
      if (identity) {
        civParts.push(`\nSTRUKTUROVANÁ IDENTITA CIVILIZACE:`);
        if (identity.culture_tags?.length) civParts.push(`  Kulturní tagy: ${identity.culture_tags.join(", ")}`);
        civParts.push(`  Urbanismus: ${identity.urban_style}`);
        civParts.push(`  Společenská struktura: ${identity.society_structure}`);
        civParts.push(`  Vojenská doktrína: ${identity.military_doctrine}`);
        civParts.push(`  Ekonomické zaměření: ${identity.economic_focus}`);
        civParts.push(`MUSÍŠ tyto tagy reflektovat ve veškerém generovaném obsahu — popisy měst, budov, strategické rady, kroniky.`);
      }

      civParts.push("=== KONEC CIV KONTEXTU ===");
      premisePrompt += civParts.join("\n");
    }
  }

  // ── STRATEGIC MAP CONTEXT ──
  try {
    const mapContext = await buildStrategicMapContext(client, sessionId);
    if (mapContext) {
      premisePrompt += "\n\n" + mapContext;
    }
  } catch (e) {
    console.warn("Failed to build strategic map context:", e);
  }

  return { sessionId, requestId, turnNumber, premise, premisePrompt, civContext };
}

/**
 * Build a compressed strategic map summary for AI.
 * Includes: biome distribution, chokepoints, rivers, mountain barriers, city positions.
 */
async function buildStrategicMapContext(client: SupabaseClient, sessionId: string): Promise<string | null> {
  // Load hex summary stats
  const [{ data: hexes }, { data: provinces }, { data: cities }] = await Promise.all([
    client.from("province_hexes")
      .select("q, r, biome_family, has_river, has_bridge, coastal, is_passable, owner_player, province_id")
      .eq("session_id", sessionId).limit(4000),
    client.from("provinces")
      .select("id, name, owner_player, center_q, center_r, color_index")
      .eq("session_id", sessionId),
    client.from("cities")
      .select("name, owner_player, province_q, province_r, settlement_level")
      .eq("session_id", sessionId),
  ]);

  if (!hexes || hexes.length === 0) return null;

  // Biome distribution
  const biomeCounts: Record<string, number> = {};
  let riverCount = 0, bridgeCount = 0, coastalCount = 0, impassableCount = 0;
  const rivers: string[] = [];
  const mountains: string[] = [];

  // Territory ownership
  const ownerHexCounts: Record<string, number> = {};

  for (const h of hexes) {
    biomeCounts[h.biome_family] = (biomeCounts[h.biome_family] || 0) + 1;
    if (h.has_river) { riverCount++; rivers.push(`(${h.q},${h.r})`); }
    if (h.has_bridge) bridgeCount++;
    if (h.coastal) coastalCount++;
    if (!h.is_passable) impassableCount++;
    if (h.biome_family === "mountains") mountains.push(`(${h.q},${h.r})`);
    if (h.owner_player) {
      ownerHexCounts[h.owner_player] = (ownerHexCounts[h.owner_player] || 0) + 1;
    }
  }

  const parts: string[] = [];
  parts.push("=== STRATEGICKÁ MAPA SVĚTA ===");
  parts.push(`Celkem hexů: ${hexes.length}, z toho neprostupných: ${impassableCount}`);
  parts.push("PRAVIDLA PRŮCHODNOSTI:");
  parts.push("- Moře (sea): NEPROSTUPNÉ — armády nemohou vstoupit");
  parts.push("- Hory (mountains): NEPROSTUPNÉ — tvoří přírodní bariéry a chokepoints");
  parts.push("- Řeky: NEPROSTUPNÉ bez mostu — tvoří bariéry jako moře/hory");
  parts.push("- Most na řece: umožňuje průchod — strategický bod");
  parts.push("- Města lze zakládat POUZE na: pláně, kopce, les, bažiny");
  parts.push(`\nBIOMY: ${Object.entries(biomeCounts).map(([b, c]) => `${b}: ${c}`).join(", ")}`);
  parts.push(`Pobřežní: ${coastalCount}, Řeky: ${riverCount}, Mosty: ${bridgeCount}`);

  // Territory control summary
  if (Object.keys(ownerHexCounts).length > 0) {
    parts.push("\nÚZEMNÍ KONTROLA:");
    const unowned = hexes.filter(h => !h.owner_player).length;
    for (const [owner, count] of Object.entries(ownerHexCounts).sort((a, b) => b[1] - a[1])) {
      parts.push(`  ${owner}: ${count} hexů`);
    }
    parts.push(`  Neutrální/nezabrané: ${unowned} hexů`);
  }

  // Province summary
  if (provinces && provinces.length > 0) {
    parts.push("\nPROVINCIE:");
    for (const p of provinces) {
      parts.push(`  ${p.name} (${p.owner_player}) centrum: (${p.center_q},${p.center_r})`);
    }
  }

  if (rivers.length > 0 && rivers.length <= 30) {
    parts.push(`\nŘeky na: ${rivers.slice(0, 20).join(", ")}${rivers.length > 20 ? "..." : ""}`);
  }
  if (mountains.length > 0 && mountains.length <= 40) {
    parts.push(`Hory na: ${mountains.slice(0, 25).join(", ")}${mountains.length > 25 ? "..." : ""}`);
  }

  if (cities && cities.length > 0) {
    parts.push("\nMĚSTA:");
    for (const c of cities) {
      parts.push(`  ${c.name} (${c.owner_player}) na (${c.province_q},${c.province_r}) [${c.settlement_level}]`);
    }
  }

  parts.push("=== KONEC STRATEGICKÉ MAPY ===");
  return parts.join("\n");
}

/**
 * Invoke AI with full premise injection, error handling, and debug metadata.
 * This is the ONLY way AI should be called across all generators.
 */
export async function invokeAI(
  ctx: AIRequestContext,
  opts: AIInvokeOptions,
): Promise<AIInvokeResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      error: "LOVABLE_API_KEY not configured",
      debug: {
        requestId: ctx.requestId,
        model: opts.model || "unknown",
        premiseVersion: ctx.premise.version,
        sessionId: ctx.sessionId,
        turnNumber: ctx.turnNumber,
      },
    };
  }

  const model = opts.model || "google/gemini-3-flash-preview";

  // Inject premise into system prompt
  const fullSystemPrompt = `${ctx.premisePrompt}\n\n${opts.systemPrompt}`;

  const body: any = {
    model,
    messages: [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
  };

  if (opts.tools) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const debug = {
    requestId: ctx.requestId,
    model,
    premiseVersion: ctx.premise.version,
    sessionId: ctx.sessionId,
    turnNumber: ctx.turnNumber,
  };

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ai-context] ${ctx.requestId} AI error:`, response.status, errText);

      if (response.status === 429) {
        return { ok: false, error: "Rate limit, zkuste to znovu za chvíli.", status: 429, debug };
      }
      if (response.status === 402) {
        return { ok: false, error: "AI kredity vyčerpány.", status: 402, debug };
      }
      return { ok: false, error: `AI gateway error: ${response.status}`, status: response.status, debug };
    }

    const data = await response.json();

    // Extract tool call result if present
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return { ok: true, data: parsed, debug };
      } catch (parseErr) {
        console.error(`[ai-context] ${ctx.requestId} Tool call parse error:`, parseErr);
      }
    }

    // Fallback to content
    const content = data.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return { ok: true, data: parsed, debug };
    } catch {
      // Return raw content
      return { ok: true, data: { content }, debug };
    }
  } catch (e) {
    console.error(`[ai-context] ${ctx.requestId} Invocation error:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error", debug };
  }
}

// ─── CORS Helper ───

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, status = 500) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
