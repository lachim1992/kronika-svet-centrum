/**
 * PRODUCTION CONTRACT NORMALIZER + CATALOG AUDIT (pure, shared).
 *
 * Saved templates and city_buildings persist a production contract (exact recipe whitelist +
 * declared roles). When the catalogue changes role semantics — zero-input extraction became
 * 'source' — old saves keep a stale role and the exact whitelist would reject the recipe.
 * This module reconciles that ONE deterministic legacy drift and nothing else: a factory whose
 * recipes have inputs never gains 'source', so nothing can create goods from nothing.
 */
import { canonicalSettlementLevel } from './buildValidation.ts';

export interface RecipeLike {
  recipe_key: string; required_role?: string | null; input_items?: unknown[] | null; required_tags?: string[] | null;
  output_good_key?: string | null;
}
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
export const isZeroInputSource = (r: RecipeLike) => r?.required_role === 'source' && list(r?.input_items).length === 0;
const catalog = (recipes: Map<string, RecipeLike> | RecipeLike[]) =>
  recipes instanceof Map ? recipes : new Map(list(recipes).map((r: RecipeLike) => [r.recipe_key, r]));

export interface ContractNormalization { effects: any; notes: string[]; changed: boolean }

/**
 * Reconcile stale persisted role metadata against the current recipe catalogue.
 * Exact `recipe_keys` stay authoritative; only role metadata is adjusted, deterministically.
 */
export function normalizeProductionContract(effects: any, recipes: Map<string, RecipeLike> | RecipeLike[]): ContractNormalization {
  const notes: string[] = [];
  if (!effects || !Array.isArray(effects.recipe_keys) || !Array.isArray(effects.production_roles)) return { effects, notes, changed: false };
  const byKey = catalog(recipes);
  const whitelisted = effects.recipe_keys.map((k: string) => byKey.get(k)).filter(Boolean) as RecipeLike[];
  for (const k of effects.recipe_keys) if (!byKey.has(k)) notes.push(`unknown_recipe:${k}`);
  if (!whitelisted.length) return { effects, notes, changed: false };
  let roles: string[] = effects.production_roles.map((r: unknown) => String(r));
  const sources = whitelisted.filter(isZeroInputSource);
  if (sources.length && !roles.includes('source')) { roles = [...roles, 'source']; notes.push('legacy_zero_input_source_role'); }
  // A structure that ONLY runs zero-input extraction is canonically a source; drop the stale 'producer'.
  if (sources.length === whitelisted.length && roles.includes('producer')) {
    roles = roles.filter(r => r !== 'producer'); notes.push('legacy_producer_role_dropped');
  }
  if (!notes.some(n => n.startsWith('legacy_'))) return { effects, notes, changed: false };
  return { effects: { ...effects, production_roles: roles }, notes, changed: true };
}

/** Legacy signature kept for callers that only need the role list. */
export function normalizeStructureRoles(roles: string[], whitelisted: any[], roleOf: (r: any) => string) {
  if (!roles.includes('producer') || roles.includes('source')) return roles;
  return whitelisted.some(r => roleOf(r) === 'source' && !list(r?.input_items).length) ? [...roles, 'source'] : roles;
}

export interface ContractFinding { level: 'error' | 'warning'; scope: 'recipe' | 'template' | 'building'; id: string; issue: string }

/**
 * Full catalogue × template × saved-row contract audit. Deterministic, no DB access: callers feed
 * the rows in. Every finding is a real contract break that would silently disable production.
 */
export function auditProductionContracts(input: {
  recipes: RecipeLike[]; templates: any[]; buildings?: any[];
  /** Recipes documented as producing without inputs (explicit exceptions). */
  zeroInputExceptions?: string[];
}): ContractFinding[] {
  const out: ContractFinding[] = [];
  const byKey = catalog(input.recipes);
  const except = new Set(input.zeroInputExceptions || []);
  for (const r of input.recipes) {
    if (list(r.input_items).length === 0 && r.required_role !== 'source' && !except.has(r.recipe_key))
      out.push({ level: 'error', scope: 'recipe', id: r.recipe_key, issue: `zero-input recipe with role ${r.required_role}` });
  }
  const checkContract = (scope: 'template' | 'building', id: string, effects: any, tags: string[]) => {
    if (!effects || !Array.isArray(effects.recipe_keys) || !effects.recipe_keys.length) return;
    const norm = normalizeProductionContract(effects, byKey);
    const roles: string[] = list(norm.effects.production_roles).map(String);
    for (const k of effects.recipe_keys) {
      const r = byKey.get(k);
      if (!r) { out.push({ level: 'error', scope, id, issue: `unknown recipe ${k}` }); continue; }
      if (roles.length && !roles.includes(String(r.required_role)) && !(isZeroInputSource(r) && roles.includes('source')))
        out.push({ level: 'error', scope, id, issue: `recipe ${k} needs role ${r.required_role}, declared ${roles.join('|')}` });
      const missing = list(r.required_tags).map(String).filter(t => !tags.includes(t));
      if (missing.length) out.push({ level: 'error', scope, id, issue: `recipe ${k} needs tags ${missing.join(',')}` });
    }
  };
  for (const t of input.templates) {
    if (canonicalSettlementLevel(t.required_settlement_level) == null)
      out.push({ level: 'error', scope: 'template', id: String(t.name ?? t.id), issue: `unknown settlement tier ${t.required_settlement_level}` });
    checkContract('template', String(t.name ?? t.id), t.effects, list(t.effects?.capability_tags).map(String));
  }
  for (const b of input.buildings || []) {
    const effects = b.effects || {};
    checkContract('building', String(b.name ?? b.id), effects, list(effects.capability_tags).map(String));
  }
  return out;
}
