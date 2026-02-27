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

  if (premise.loreBible) {
    parts.push(`LORE BIBLE:\n${premise.loreBible.substring(0, 1200)}`);
  }

  if (premise.worldVibe) {
    parts.push(`ATMOSFÉRA SVĚTA: ${premise.worldVibe}`);
  }

  const writingInstruction = WRITING_STYLE_MAP[premise.writingStyle] || WRITING_STYLE_MAP["narrative"];
  parts.push(`STYL PSANÍ: ${writingInstruction}`);

  const epochInstruction = EPOCH_STYLE_MAP[premise.epochStyle] || EPOCH_STYLE_MAP["kroniky"];
  parts.push(`EPOCHA: ${epochInstruction}`);

  if (premise.cosmology) {
    parts.push(`KOSMOLOGIE: ${premise.cosmology}`);
  }

  if (premise.constraints) {
    parts.push(`OMEZENÍ: ${premise.constraints}`);
  }

  if (premise.economicBias !== "balanced") {
    parts.push(`EKONOMICKÝ DŮRAZ: ${premise.economicBias}`);
  }

  if (premise.warBias !== "neutral") {
    parts.push(`VÁLEČNÝ DŮRAZ: ${premise.warBias}`);
  }

  if (premise.seed) {
    parts.push(`SVĚT SEED: ${premise.seed}`);
  }

  // Narrative rules from server_config (saga/history config)
  const saga = premise.narrativeRules?.saga;
  const history = premise.narrativeRules?.history;

  if (saga) {
    if (saga.stance && saga.stance !== "pro-regime") {
      const stanceMap: Record<string, string> = {
        "neutral": "Piš neutrálně, bez zaujatosti k žádné straně.",
        "critical": "Piš kriticky, zpochybňuj motivy vládců a poukazuj na slabiny.",
        "mythical": "Piš jako mýtický vypravěč, zesiluj nadpřirozené prvky a osudovost.",
        "pro-regime": "Piš jako dvorní kronikář, oslavuj vládce a jeho činy.",
      };
      parts.push(`POSTOJ KRONIKÁŘE: ${stanceMap[saga.stance] || saga.stance}`);
    }
    if (saga.style_prompt) {
      parts.push(`STYLOVÝ POKYN PRO SÁGY: ${saga.style_prompt}`);
    }
    if (saga.keywords?.length) {
      parts.push(`PREFEROVANÁ KLÍČOVÁ SLOVA: ${saga.keywords.join(", ")}`);
    }
    if (saga.forbidden?.length) {
      parts.push(`ZAKÁZANÁ SLOVA (nikdy nepoužívej): ${saga.forbidden.join(", ")}`);
    }
  }

  if (history) {
    if (history.style_prompt) {
      parts.push(`STYLOVÝ POKYN PRO HISTORII: ${history.style_prompt}`);
    }
    if (history.include_metrics) {
      parts.push("ZAHRNOUT METRIKY: Ano — uváděj populační, ekonomické a vojenské statistiky kde jsou k dispozici.");
    }
  }

  // Inject civilization DNA context if available
  parts.push("=== KONEC PREMISY ===");
  // Note: civ context is injected dynamically via createAIContext playerName param

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

  // Load civilization DNA for cultural context injection
  let civContext: AIRequestContext["civContext"] = undefined;
  if (playerName) {
    const { data: civ } = await client
      .from("civilizations")
      .select("cultural_quirk, architectural_style, civ_name")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();
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
      civParts.push("=== KONEC CIV KONTEXTU ===");
      premisePrompt += civParts.join("\n");
    }
  }

  return { sessionId, requestId, turnNumber, premise, premisePrompt, civContext };
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
