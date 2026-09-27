/**
 * Central AI model registry — the ONLY place that decides which model a
 * request uses. Functions declare a PURPOSE; the purpose maps to a TIER and
 * the tier maps to a model. Override per session via
 * server_config.economic_params.ai.{tiers,purposes,flags}.
 *
 * Model IDs below are the ones this project already used before the pass
 * (no silent model substitution). Swap a tier here or via config.
 */

export type AIPurpose =
  | "AI_FACTION_DECISION"
  | "AI_FACTION_WAR_DECISION"
  | "WORLD_CHRONICLE"
  | "RUMOR_BATCH"
  | "WIKI_TEXT"
  | "WIKI_ENRICH"
  | "HISTORY_AGGREGATION"
  | "BATTLE_REACTION"
  | "SPORTS_FLAVOR"
  | "IMAGE_GENERATION"
  | "SPECIAL_NARRATIVE";

export type AITier = "cheap_text" | "standard_reasoning" | "strategic_reasoning" | "quality_narrative" | "image";

export const DEFAULT_TIER_MODELS: Record<AITier, string> = {
  cheap_text: "google/gemini-2.5-flash-lite",
  standard_reasoning: "google/gemini-2.5-flash",
  strategic_reasoning: "google/gemini-2.5-pro",
  quality_narrative: "google/gemini-3-flash-preview",
  image: "google/gemini-2.5-flash-image",
};

export const PURPOSE_TIER: Record<AIPurpose, AITier> = {
  AI_FACTION_DECISION: "standard_reasoning",
  AI_FACTION_WAR_DECISION: "strategic_reasoning",
  WORLD_CHRONICLE: "quality_narrative",
  RUMOR_BATCH: "cheap_text",
  WIKI_TEXT: "cheap_text",
  WIKI_ENRICH: "cheap_text",
  HISTORY_AGGREGATION: "standard_reasoning",
  BATTLE_REACTION: "cheap_text",
  SPORTS_FLAVOR: "cheap_text",
  IMAGE_GENERATION: "image",
  SPECIAL_NARRATIVE: "quality_narrative",
};

/** Output budgets (tokens) per purpose — prompts state lengths, this is the hard cap. */
export const PURPOSE_MAX_TOKENS: Partial<Record<AIPurpose, number>> = {
  AI_FACTION_DECISION: 1500,
  AI_FACTION_WAR_DECISION: 2000,
  WORLD_CHRONICLE: 1600,
  RUMOR_BATCH: 1800,
  WIKI_TEXT: 900,
  WIKI_ENRICH: 900,
  HISTORY_AGGREGATION: 2500,
  BATTLE_REACTION: 400,
  SPORTS_FLAVOR: 500,
};

/** Rough USD per 1M tokens (input, output). Estimates only — used for estimated_cost. */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-pro": { in: 1.25, out: 10 },
  "google/gemini-3-flash-preview": { in: 0.5, out: 3 },
  "google/gemini-3.1-flash-lite": { in: 0.1, out: 0.4 },
  "google/gemini-2.5-flash-image": { in: 0.3, out: 30 },
};

export function estimateCost(model: string, inTok: number, outTok: number): number | null {
  const p = MODEL_PRICING[model];
  if (!p) return null;
  return Number(((inTok * p.in + outTok * p.out) / 1_000_000).toFixed(6));
}

/** Feature flags for automatic generation during commit-turn. */
export interface AIFlags {
  auto_world_chronicle: boolean;
  auto_player_chronicle: boolean;
  auto_world_history: boolean;
  auto_rumor_batch: boolean;
  auto_wiki_enrich: boolean;
  auto_wiki_backfill: boolean;
  auto_images: boolean;
}

export const DEFAULT_AI_FLAGS: AIFlags = {
  auto_world_chronicle: true,
  auto_player_chronicle: false,
  auto_world_history: false,
  auto_rumor_batch: true,
  auto_wiki_enrich: false, // commit-turn only marks wiki dirty
  auto_wiki_backfill: false,
  auto_images: false,
};

export interface AIConfigOverride {
  tiers?: Partial<Record<AITier, string>>;
  purposes?: Partial<Record<AIPurpose, AITier>>;
  flags?: Partial<AIFlags>;
}

export function resolveModel(purpose: AIPurpose | undefined, override?: AIConfigOverride): string {
  const p = purpose ?? "SPECIAL_NARRATIVE";
  const tier = override?.purposes?.[p] ?? PURPOSE_TIER[p] ?? "quality_narrative";
  return override?.tiers?.[tier] ?? DEFAULT_TIER_MODELS[tier];
}

export function resolveFlags(override?: AIConfigOverride): AIFlags {
  return { ...DEFAULT_AI_FLAGS, ...(override?.flags ?? {}) };
}

export function isAIPurpose(v: unknown): v is AIPurpose {
  return typeof v === "string" && v in PURPOSE_TIER;
}

// deno-lint-ignore no-explicit-any
export async function loadAIConfig(sb: any, sessionId: string): Promise<AIConfigOverride> {
  try {
    const { data } = await sb.from("server_config").select("economic_params").eq("session_id", sessionId).maybeSingle();
    return ((data as any)?.economic_params?.ai ?? {}) as AIConfigOverride;
  } catch {
    return {};
  }
}
