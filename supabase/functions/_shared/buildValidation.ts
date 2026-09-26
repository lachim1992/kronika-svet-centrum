/**
 * AUTHORITATIVE BUILD VALIDATION — pure and shared by command-dispatch and tests.
 * A player build is resolved from a building template; the client never decides cost, time,
 * effects, recipes, levels or prerequisites. Geography and settlement rules are hard blockers.
 */
export const SETTLEMENT_RANK: Record<string, number> = { HAMLET: 1, TOWNSHIP: 2, CITY: 3, POLIS: 4 };
/** Legacy aliases → canonical four-tier progression (HAMLET < TOWNSHIP < CITY < POLIS). */
export const SETTLEMENT_ALIASES: Record<string, string> = { HAMLET: 'HAMLET', VILLAGE: 'TOWNSHIP', TOWNSHIP: 'TOWNSHIP', TOWN: 'CITY', CITY: 'CITY', POLIS: 'POLIS' };
/** Canonical tier or null for a truly unknown value (callers fail closed). */
export function canonicalSettlementLevel(v: unknown): string | null {
  if (v == null || v === '') return 'HAMLET';
  return SETTLEMENT_ALIASES[String(v).trim().toUpperCase()] ?? null;
}
export const settlementRank = (v: unknown) => { const c = canonicalSettlementLevel(v); return c ? SETTLEMENT_RANK[c] : null; };
export const WATER_REASON = "Nedostupné: tato stavba potřebuje řeku nebo pobřeží.";

/** Production-defining effect keys that only a template may declare. */
const PRODUCTION_KEYS = ["recipe_keys", "basket_outputs", "jobs_capacity", "capability_tags", "production_roles", "storage_capacity", "warehouse_level"];

export interface BuildContext {
  actor: string;
  city: { owner_player: string | null; settlement_level?: string | null };
  tile?: { has_river?: boolean | null; coastal?: boolean | null; biome_family?: string | null; resource_deposits?: unknown } | null;
  existingBuildingNames: string[];
  existingTemplateIds: string[];
}

export const requiresWater = (t: any) => !!(t?.requires_water ?? t?.effects?.requires_water);

/** Returns the exact player-facing reason, or null when the build is legal. */
export function validateBuild(template: any, ctx: BuildContext): string | null {
  if (!ctx.city.owner_player || ctx.city.owner_player !== ctx.actor) return "Nedostupné: stavět lze jen ve vlastním městě";
  const e = template?.effects || {};
  const need = settlementRank(template?.required_settlement_level);
  if (need == null) return `Nedostupné: neznámá požadovaná úroveň sídla (${template.required_settlement_level})`;
  const have = settlementRank(ctx.city.settlement_level) ?? 1;
  if (have < need) return `Nedostupné: vyžaduje sídlo úrovně ${template.required_settlement_level}`;
  if (template?.is_unique && ctx.existingTemplateIds.includes(template.id)) return "Nedostupné: unikátní stavba už v městě stojí";
  if (requiresWater(template) && !(ctx.tile?.has_river || ctx.tile?.coastal)) return WATER_REASON;
  const biomes: string[] | undefined = e.allowed_biomes;
  if (biomes?.length && !biomes.includes(String(ctx.tile?.biome_family || ""))) return `Nedostupné: vyžaduje terén ${biomes.join(", ")}`;
  const deposit: string | undefined = e.requires_deposit;
  if (deposit) {
    const d = ctx.tile?.resource_deposits;
    const list = Array.isArray(d) ? d.map((x: any) => String(x?.type ?? x?.key ?? x)) : d && typeof d === "object" ? Object.keys(d) : [];
    if (!list.includes(deposit)) return `Nedostupné: vyžaduje ložisko ${deposit}`;
  }
  const prereq: string[] | undefined = e.requires_buildings;
  if (prereq?.length) for (const p of prereq) if (!ctx.existingBuildingNames.includes(p)) return `Nedostupné: nejdřív postav ${p}`;
  return null;
}

/** Canonical building row fields from the template; client-only cosmetic fields may pass through. */
export function canonicalBuilding(template: any, client: any = {}) {
  return {
    template_id: template.id, name: template.name, description: template.description || "", category: template.category || "economic",
    cost_wealth: Number(template.cost_wealth) || 0, cost_wood: Number(template.cost_wood) || 0,
    cost_stone: Number(template.cost_stone) || 0, cost_iron: Number(template.cost_iron) || 0,
    build_duration: Number(template.build_duration || template.build_turns) || 1,
    effects: template.effects || {}, max_level: template.max_level || 3, level_data: template.level_data || [],
    building_tags: template.building_tags || null, is_arena: !!template.is_arena,
    flavor_text: client.flavor_text ?? template.flavor_text ?? null, image_prompt: client.image_prompt ?? template.image_prompt ?? null,
    image_url: client.image_url ?? null, founding_myth: client.founding_myth ?? null,
  };
}

/** Custom (AI-generated, template-less) buildings keep narrative effects only — never production. */
export function stripProductionEffects(effects: any) {
  const out = { ...(effects || {}) };
  for (const k of PRODUCTION_KEYS) delete out[k];
  return out;
}
