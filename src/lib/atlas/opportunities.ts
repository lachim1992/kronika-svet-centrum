import type { DbRecipe } from "./chains";

export type Opportunity = { good: string; city: string; reason: string; blocker: string; certainty: "doloženo reportem" | "odvozeno"; unmet: number | null; localPrice: number | null; basePrice: number | null; hasRecipe: boolean; ownPotential: boolean; margin: number | null };

/**
 * Deterministic: only goods the owner-scoped report shows as unmet (import_blockers) or as an
 * 'opportunity' alert. Prices come from report.prices; margin only if a producer of that good reports one.
 */
export function deriveOpportunities(report: any, recipes: DbRecipe[], potentialRecipes: Set<string>): Opportunity[] {
  if (!report) return [];
  const priceOf = (city: string, good: string) => (report.prices || []).find((p: any) => p.city === city && p.good === good);
  const cityName = (id: string) => (report.cities || []).find((c: any) => c.id === id)?.name || id;
  const out: Opportunity[] = [];
  const push = (city: string, good: string, unmet: number | null, reason: string, certainty: Opportunity["certainty"]) => {
    if (out.some(o => o.good === good && o.city === cityName(city))) return;
    const pr = priceOf(city, good);
    const makers = recipes.filter(r => r.output_good_key === good);
    const ownPotential = makers.some(r => potentialRecipes.has(r.recipe_key));
    const prod = (report.producers || []).find((p: any) => p.city === city && p.good === good && typeof p.margin?.margin === "number");
    const blocker = !makers.length ? "Žádný recept tento produkt nevyrábí." : ownPotential ? "Je potřeba obsadit pole, postavit zařízení a mít pracovní sílu." : "Na vašem území není doložený zdroj; zvažte dovoz vstupů nebo budovu zpracování.";
    out.push({ good, city: cityName(city), reason, blocker, certainty, unmet, localPrice: pr?.local_price ?? null, basePrice: pr?.base_price ?? null, hasRecipe: makers.length > 0, ownPotential, margin: prod ? prod.margin.margin : null });
  };
  for (const b of report.import_blockers || []) push(b.city, b.good, typeof b.unmet === "number" ? b.unmet : null, `Neuspokojená poptávka; dovoz blokován: ${b.reason}`, "doloženo reportem");
  for (const a of report.alerts || []) if (a.severity === "opportunity" && a.entity_type === "good") push(a.entity_id.split(":")[0] || "", a.metric, null, a.reason, "doloženo reportem");
  return out.sort((a, b) => (b.unmet ?? 0) - (a.unmet ?? 0));
}
