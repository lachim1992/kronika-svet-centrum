import { producersOfRecipe, PRODUCTION_BUILDINGS } from "./canon";

export type DbRecipe = { recipe_key: string; output_good_key: string; output_quantity: number | null; input_items: any; required_role: string | null; required_tags: string[] | null; labor_cost: number | null; description: string | null };
export type RecipeInput = { good: string; qty: number | null; kind: string | null };

/** DB input_items can be [{good,qty,kind}] or legacy [{good_key,quantity}]; normalise without inventing quantities. */
export function recipeInputs(r: DbRecipe): RecipeInput[] {
  const list = Array.isArray(r.input_items) ? r.input_items : [];
  return list.map((i: any) => ({ good: String(i?.good ?? i?.good_key ?? i?.key ?? ""), qty: typeof (i?.qty ?? i?.quantity) === "number" ? (i.qty ?? i.quantity) : null, kind: i?.kind ?? null })).filter(i => i.good);
}

export type ChainNode = { good: string; cycle: boolean; depthCut: boolean; recipes: { recipe: DbRecipe; producers: { building: string; level: number }[]; inputs: { input: RecipeInput; node: ChainNode }[] }[] };

/** Upstream tree for a good using only DB recipes. Cycles and depth are marked, never hidden. */
export function buildChain(good: string, recipes: DbRecipe[], maxDepth = 6, path: string[] = []): ChainNode {
  if (path.includes(good)) return { good, cycle: true, depthCut: false, recipes: [] };
  if (path.length >= maxDepth) return { good, cycle: false, depthCut: true, recipes: [] };
  const next = [...path, good];
  return {
    good, cycle: false, depthCut: false,
    recipes: recipes.filter(r => r.output_good_key === good).map(recipe => ({
      recipe, producers: producersOfRecipe(recipe.recipe_key),
      inputs: recipeInputs(recipe).map(input => ({ input, node: buildChain(input.good, recipes, maxDepth, next) })),
    })),
  };
}

/** Downstream: recipes that consume a good. */
export const usesOf = (good: string, recipes: DbRecipe[]) => recipes.filter(r => recipeInputs(r).some(i => i.good === good));

export function catalogMismatch(recipes: DbRecipe[], goodKeys: Set<string>) {
  const dbKeys = new Set(recipes.map(r => r.recipe_key));
  const catalogKeys = new Set(PRODUCTION_BUILDINGS.flatMap(b => b.levels.flat()));
  return {
    noBuilding: recipes.filter(r => producersOfRecipe(r.recipe_key).length === 0).map(r => r.recipe_key),
    missingInDb: [...catalogKeys].filter(k => !dbKeys.has(k)),
    unknownGoods: recipes.flatMap(r => [r.output_good_key, ...recipeInputs(r).map(i => i.good)]).filter((g, i, a) => !goodKeys.has(g) && a.indexOf(g) === i),
  };
}
