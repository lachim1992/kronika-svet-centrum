/** Building levels are not node infrastructure or route levels. All gameplay upgrades are sequential. */
export function validateBuildingUpgrade(building: any, city: any, actor: string, requested: unknown, template?: any): string | null {
  if (!building || !city || city.owner_player !== actor || building.city_id !== city.id) return 'Budovu lze vylepšit jen ve vlastním městě';
  if (building.status !== 'completed') return 'Nejdříve dokončete stavbu';
  const current = Number(building.current_level ?? 1);
  const max = Number(template?.max_level ?? building.max_level ?? 3);
  if (!Number.isInteger(requested) || Number(requested) !== current + 1) return 'Vylepšení musí zvýšit úroveň právě o jednu';
  if (!Number.isFinite(max) || Number(requested) > max) return 'Budova již dosáhla maximální úrovně';
  return null;
}
const PRODUCTION_KEYS = ["recipe_keys", "basket_outputs", "jobs_capacity", "capability_tags", "production_roles", "storage_capacity", "warehouse_level"];
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

export interface UpgradeQuote { cost_wealth: number; cost_production: number; name: string; effects: Record<string, unknown>; wonder: boolean }

/**
 * Authoritative upgrade quote. Costs, name and effects come only from the template (or, for a legacy
 * template-less row, its stored base cost + level_data); client costs/effects/name/wonder flags are ignored.
 * Template-less buildings never gain production effects. Returns an error string when unverifiable.
 */
export function quoteBuildingUpgrade(building: any, template: any | null, targetLevel: number): UpgradeQuote | string {
  const src = template ?? building;
  const levels: any[] = Array.isArray(src?.level_data) ? src.level_data : [];
  const lvl = levels.find(l => Number(l?.level) === targetLevel);
  if (!lvl) return "Chybí ověřitelná data úrovně";
  const mult = num(lvl.cost_mult ?? lvl.upgrade_cost_multiplier);
  if (!Number.isFinite(mult) || mult <= 0 || mult > 100) return "Neplatný násobek ceny úrovně";
  const base = { w: num(src.cost_wealth), wo: num(src.cost_wood), s: num(src.cost_stone), i: num(src.cost_iron) };
  if (Object.values(base).some(v => !Number.isFinite(v) || v < 0)) return "Neplatná základní cena";
  if (!template && base.w + base.wo + base.s + base.i <= 0) return "Starou budovu bez ověřitelné ceny nelze vylepšit";
  const inherited = template ? { ...(template.effects || {}) } : { ...(building.effects || {}) };
  let effects: Record<string, unknown> = { ...inherited, ...(lvl.effects || {}) };
  if (!template) for (const k of PRODUCTION_KEYS) { if (k in inherited) effects[k] = inherited[k]; else delete effects[k]; }
  return {
    cost_wealth: Math.ceil(base.w * mult),
    cost_production: Math.ceil((base.wo + base.s + base.i) * mult),
    name: String(lvl.name || building.name),
    effects,
    wonder: lvl.is_wonder === true || lvl.wonder === true,
  };
}
