/**
 * Read-only view of the canonical production contract for the UI.
 *
 * Mirrors nothing on its own: it re-uses the shared production catalog so the UI can
 * explain WHY a basket is short (missing source, missing processing building, missing
 * route/supplier) instead of showing a bare deficit number.
 */
import {
  GOODS,
  RECIPES,
  recipeByKey,
  producersOfRecipe,
  type CatalogGood,
} from "../../supabase/functions/_shared/productionCatalog";

export interface ChainStep {
  recipe: string;
  good: string;
  inputs: string[];
  /** Structures (and required level) able to run this step. */
  buildings: { building: string; level: number }[];
}

/** Ordered chain (roots first) needed to make the final goods of a demand basket. */
export function productionChainForBasket(basket: string): ChainStep[] {
  const targets = GOODS.filter((g: CatalogGood) => g.basket === basket && g.finalUse);
  const steps: ChainStep[] = [];
  const seen = new Set<string>();
  const visit = (good: string, depth = 0) => {
    if (depth > 6) return;
    const recipe = RECIPES.find((r) => r.output === good);
    if (!recipe || seen.has(recipe.key)) return;
    seen.add(recipe.key);
    for (const input of recipe.inputs) visit(input.good, depth + 1);
    steps.push({
      recipe: recipe.key,
      good: recipe.output,
      inputs: recipe.inputs.map((i) => i.good),
      buildings: producersOfRecipe(recipe.key),
    });
  };
  for (const target of targets) visit(target.key);
  return steps;
}

/** Compact arrow notation, e.g. "raw_grain → Mlýn → flour → Pekárna → baked_staples". */
export function chainLabel(steps: ChainStep[]): string {
  const parts: string[] = [];
  for (const step of steps) {
    for (const input of step.inputs) if (!parts.includes(input)) parts.push(input);
    const building = step.buildings[0]?.building;
    if (building) parts.push(building);
    parts.push(step.good);
  }
  return parts.join(" → ");
}

/**
 * First blocking step of the chain given the structures a city actually has.
 * Returns null when every step has a present structure (the shortage then comes from
 * workforce, routes, suppliers or capacity rather than from missing buildings).
 */
export function firstMissingStep(steps: ChainStep[], presentBuildings: string[]): ChainStep | null {
  const present = presentBuildings.map((n) => n.toLowerCase());
  for (const step of steps) {
    if (!step.buildings.length) return step;
    const has = step.buildings.some((b) => present.includes(b.building.toLowerCase()));
    if (!has) return step;
  }
  return null;
}

export const recipeDisplay = (key: string) => recipeByKey.get(key)?.output ?? key;
